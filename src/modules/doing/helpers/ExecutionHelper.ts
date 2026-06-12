import { Repos } from "../repositories/index.js";
import { AutomationExecution, Task, WorkflowTrigger } from "../models/index.js";
import { ConjunctionHelper } from "./ConjunctionHelper.js";
import { FilterMatcher } from "./FilterMatcher.js";
import { WorkflowHelper } from "./WorkflowHelper.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

interface Subject {
  type: string;
  id?: string;
  label?: string;
}

// Execution lifecycle for the rule engine: every trigger firing becomes an
// automationExecutions row (PC-parity history). The first attempt runs inline;
// failures are retried with backoff by processDue (scheduled-tasks timer). A row is
// created pending with a short lease so a crash mid-attempt is picked up by the worker.
export class ExecutionHelper {
  private static readonly LEASE_MINUTES = 10;
  private static readonly MAX_ATTEMPTS = 6;
  private static readonly RETRY_MINUTES = [5, 30, 120, 720, 1440];

  public static async startAndAttempt(trigger: WorkflowTrigger, subject: Subject, eventType: string, repos: Repos): Promise<AutomationExecution> {
    const execution: AutomationExecution = {
      churchId: trigger.churchId,
      triggerId: trigger.id,
      workflowId: trigger.workflowId,
      subjectType: subject.type,
      subjectId: subject.id,
      subjectLabel: subject.label,
      eventType,
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: this.addMinutes(new Date(), this.LEASE_MINUTES)
    };
    await repos.automationExecution.save(execution);
    return this.attempt(execution, trigger, repos);
  }

  public static async attempt(execution: AutomationExecution, trigger: WorkflowTrigger, repos: Repos): Promise<AutomationExecution> {
    try {
      // A retry may follow a crash after the card was created — don't double-add.
      if ((execution.attemptCount ?? 0) > 0 && (await this.alreadyApplied(execution, trigger, repos))) {
        execution.attemptCount = (execution.attemptCount ?? 0) + 1;
        return this.complete(execution, repos);
      }
      if (!execution.subjectLabel && execution.subjectType === "person" && execution.subjectId) {
        const people = await getMembershipModuleGateway().loadPeople(execution.churchId || "", [execution.subjectId]);
        execution.subjectLabel = people[0]?.displayName;
      }
      const card = await WorkflowHelper.addToWorkflow(
        execution.churchId || "",
        trigger.workflowId || "",
        { type: execution.subjectType || "person", id: execution.subjectId, label: execution.subjectLabel },
        { type: "system", label: "Trigger" },
        trigger.id,
        repos,
        trigger.stepId || undefined
      );
      if (!card) throw new Error("Workflow has no steps");
      execution.attemptCount = (execution.attemptCount ?? 0) + 1;
      return this.complete(execution, repos);
    } catch (err) {
      execution.attemptCount = (execution.attemptCount ?? 0) + 1;
      execution.lastError = (err as Error)?.message || String(err);
      if (execution.attemptCount >= this.MAX_ATTEMPTS) {
        execution.status = "failed";
        execution.nextAttemptAt = undefined;
        execution.dateCompleted = new Date();
      } else {
        execution.status = "pending";
        execution.nextAttemptAt = this.addMinutes(new Date(), this.RETRY_MINUTES[execution.attemptCount - 1] ?? 1440);
      }
      await repos.automationExecution.save(execution);
      return execution;
    }
  }

  // Scheduled (pull) rules: evaluate the relational condition tree over the people set
  // and fire an execution per match. Also reused by run-now on schedule rules.
  public static async runScheduledRule(rule: WorkflowTrigger, repos: Repos, eventType = "schedule"): Promise<{ created: number; skipped: number }> {
    if (!rule.workflowId || !rule.id || !rule.churchId) return { created: 0, skipped: 0 };
    const matched = await ConjunctionHelper.getPeopleIdsForTrigger(rule.churchId, rule.id, repos);
    // "*" means "no person-level constraint" — without concrete ids there is no subject to add.
    let peopleIds = matched.filter((id) => id && id !== "*");
    if (peopleIds.length === 0) return { created: 0, skipped: 0 };

    // Dedup: drop anyone who already has a card from this rule within the recurs window.
    let skipped = 0;
    const existing = (await repos.task.loadByTriggerIdContent(rule.churchId, rule.id, rule.recurs || "", "person", peopleIds)) as Task[];
    if (existing.length > 0) {
      const seen = new Set(existing.map((t) => t.associatedWithId));
      const before = peopleIds.length;
      peopleIds = peopleIds.filter((id) => !seen.has(id));
      skipped = before - peopleIds.length;
    }
    if (peopleIds.length === 0) return { created: 0, skipped };

    const people: { id: string; displayName: string }[] = await getMembershipModuleGateway().loadPeople(rule.churchId, peopleIds);
    for (const p of people) {
      await this.startAndAttempt(rule, { type: "person", id: p.id, label: p.displayName }, eventType, repos);
    }
    return { created: people.length, skipped };
  }

  // Bulk-apply-on-create: run an automation against everything that currently matches.
  // Supported where a "current set" exists; event types tied to a transient moment
  // (donation, form submission, check-in, member-left) have none.
  public static async runNow(trigger: WorkflowTrigger, repos: Repos): Promise<{ created: number; skipped: number }> {
    if (!trigger.id || !trigger.churchId || !trigger.workflowId) throw new Error("Trigger is incomplete");
    if (trigger.triggerKind === "schedule") return this.runScheduledRule(trigger, repos, "runNow");

    const node = FilterMatcher.parseConditions(trigger.conditions);
    const membership = getMembershipModuleGateway();
    let candidates: { id: string; label?: string; facts: Record<string, any> }[] = [];

    switch (trigger.eventType) {
      case "person.created":
      case "person.updated": {
        const people = await membership.loadPeopleForAutomation(trigger.churchId);
        candidates = people.map((p) => ({
          id: p.id,
          label: p.displayName,
          facts: { "person.membershipStatus": p.membershipStatus, "person.gender": p.gender, "person.maritalStatus": p.maritalStatus }
        }));
        break;
      }
      case "group.member.added": {
        const groupIds = FilterMatcher.pinnedIds(node, "group.id");
        if (groupIds.length === 0) throw new Error("Run now requires a Group condition on this trigger");
        for (const groupId of groupIds) {
          const group = await membership.loadGroup(trigger.churchId, groupId);
          const memberIds = await membership.loadGroupMemberPersonIds(trigger.churchId, groupId);
          candidates.push(...memberIds.map((id) => ({ id, facts: { "group.id": groupId, "group.name": group?.name } })));
        }
        break;
      }
      case "list.member.added": {
        const listIds = FilterMatcher.pinnedIds(node, "list.id");
        if (listIds.length === 0) throw new Error("Run now requires a List condition on this trigger");
        for (const listId of listIds) {
          const list = await membership.loadList(trigger.churchId, listId);
          const memberIds = await membership.loadListMemberPersonIds(trigger.churchId, listId);
          candidates.push(...memberIds.map((id) => ({ id, facts: { "list.id": listId, "list.name": list?.name } })));
        }
        break;
      }
      default:
        throw new Error("Run now is not supported for this trigger type");
    }

    let created = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const c of candidates) {
      if (!c.id || seen.has(c.id)) continue;
      seen.add(c.id);
      if (!FilterMatcher.matches(c.facts, node)) continue;
      // Always dedup on run-now — re-running must never mass-duplicate cards.
      if (await repos.task.loadBySubjectInWorkflow(trigger.churchId, trigger.workflowId, "person", c.id)) {
        skipped++;
        continue;
      }
      await this.startAndAttempt(trigger, { type: "person", id: c.id, label: c.label }, "runNow", repos);
      created++;
    }
    return { created, skipped };
  }

  // Timer worker: re-attempt due pending rows. Rows whose trigger was deleted fail;
  // rows whose trigger is inactive park as paused (resume-all re-queues them).
  public static async processDue(repos: Repos): Promise<number> {
    const due = (await repos.automationExecution.loadDuePending()) as AutomationExecution[];
    const triggers = new Map<string, WorkflowTrigger | null>();
    for (const execution of due) {
      try {
        const key = `${execution.churchId}/${execution.triggerId}`;
        if (!triggers.has(key)) triggers.set(key, (await repos.workflowTrigger.load(execution.churchId || "", execution.triggerId || "")) as WorkflowTrigger | null);
        const trigger = triggers.get(key);
        if (!trigger) {
          execution.status = "failed";
          execution.lastError = "Trigger no longer exists";
          execution.nextAttemptAt = undefined;
          execution.dateCompleted = new Date();
          await repos.automationExecution.save(execution);
        } else if (!FilterMatcher.toBool(trigger.active)) {
          execution.status = "paused";
          execution.nextAttemptAt = undefined;
          await repos.automationExecution.save(execution);
        } else {
          await this.attempt(execution, trigger, repos);
        }
      } catch {
        // Skip a failing row, keep processing the rest.
      }
    }
    return due.length;
  }

  private static async alreadyApplied(execution: AutomationExecution, trigger: WorkflowTrigger, repos: Repos): Promise<boolean> {
    if (!execution.subjectId) return false;
    if (trigger.triggerKind === "schedule") {
      const existing = (await repos.task.loadByTriggerIdContent(execution.churchId || "", trigger.id || "", trigger.recurs || "", execution.subjectType || "person", [execution.subjectId])) as Task[];
      return existing.length > 0;
    }
    if (!FilterMatcher.toBool(trigger.oncePerSubject)) return false;
    return !!(await repos.task.loadBySubjectInWorkflow(execution.churchId || "", trigger.workflowId || "", execution.subjectType || "person", execution.subjectId));
  }

  private static async complete(execution: AutomationExecution, repos: Repos): Promise<AutomationExecution> {
    execution.status = "success";
    execution.lastError = undefined;
    execution.nextAttemptAt = undefined;
    execution.dateCompleted = new Date();
    await repos.automationExecution.save(execution);
    return execution;
  }

  private static addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60000);
  }
}
