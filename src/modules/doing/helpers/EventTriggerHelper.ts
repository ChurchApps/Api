import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { WorkflowTrigger, Task } from "../models/index.js";
import { WorkflowHelper } from "./WorkflowHelper.js";
import { getMembershipModuleGateway, getGivingModuleGateway } from "../../../shared/modules/index.js";

interface Subject {
  type: string;
  id?: string;
  label?: string;
}

type FilterNode =
  | { type: "group"; conjunction: "AND" | "OR"; children: FilterNode[] }
  | { type: "condition"; field: string; operator: string; value: string };

// Canonical membership statuses (mirror B1Admin people/helpers/MembershipStatusOptions.ts).
const MEMBERSHIP_STATUS_OPTIONS = [
  { value: "Visitor", label: "Visitor" },
  { value: "Regular Attendee", label: "Regular Attendee" },
  { value: "Member", label: "Member" },
  { value: "Staff", label: "Staff" },
  { value: "Inactive", label: "Inactive" },
  { value: "Deceased", label: "Deceased" }
];

export interface TriggerFieldDef {
  key: string;
  label: string;
  type: "string" | "number" | "date" | "boolean" | "select";
  options?: { value: string; label: string }[];
  optionsSource?: string; // UI loads dynamic options (e.g. "funds", "groups")
}

export interface TriggerEventDef {
  eventType: string;
  label: string;
  recordType: string;
  fields: TriggerFieldDef[];
}

const PERSON_FIELDS: TriggerFieldDef[] = [
  { key: "person.membershipStatus", label: "Membership Status", type: "select", options: MEMBERSHIP_STATUS_OPTIONS },
  { key: "person.gender", label: "Gender", type: "select", options: [{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }] },
  { key: "person.maritalStatus", label: "Marital Status", type: "select", options: [{ value: "Single", label: "Single" }, { value: "Married", label: "Married" }, { value: "Divorced", label: "Divorced" }, { value: "Widowed", label: "Widowed" }] }
];

// The triggerable events. Each lists the fields a condition may reference; the
// resolve() switch below must produce a matching fact for each key.
export const EVENT_DEFS: TriggerEventDef[] = [
  { eventType: "person.created", label: "Person · Created", recordType: "person", fields: PERSON_FIELDS },
  { eventType: "person.updated", label: "Person · Updated", recordType: "person", fields: PERSON_FIELDS },
  {
    eventType: "donation.created", label: "Donation · Created", recordType: "donation", fields: [
      { key: "donation.amount", label: "Amount", type: "number" },
      { key: "donation.method", label: "Method", type: "string" },
      { key: "person.membershipStatus", label: "Donor Membership Status", type: "select", options: MEMBERSHIP_STATUS_OPTIONS },
      { key: "fundDonation.fundId", label: "Fund", type: "select", optionsSource: "funds" }
    ]
  },
  {
    eventType: "group.member.added", label: "Group · Member Joined", recordType: "group", fields: [
      { key: "group.id", label: "Group", type: "select", optionsSource: "groups" },
      { key: "group.name", label: "Group Name", type: "string" }
    ]
  },
  {
    eventType: "group.created", label: "Group · Created", recordType: "group", fields: [
      { key: "group.name", label: "Group Name", type: "string" },
      { key: "group.categoryName", label: "Category", type: "string" }
    ]
  },
  {
    eventType: "form.submission.created", label: "Form · Submitted", recordType: "form", fields: [
      { key: "formSubmission.formId", label: "Form", type: "select", optionsSource: "forms" },
      { key: "person.membershipStatus", label: "Submitter Membership Status", type: "select", options: MEMBERSHIP_STATUS_OPTIONS }
    ]
  }
];

export class EventTriggerHelper {
  private static cache = new Map<string, { types: Set<string>; expires: number }>();
  private static TTL_MS = 60000;

  public static invalidate(churchId: string): void {
    EventTriggerHelper.cache.delete(churchId);
  }

  public static fieldDefs(): TriggerEventDef[] {
    return EVENT_DEFS;
  }

  // Subscribed to InternalEventBus. Wrapped in try/catch — the doing module may
  // not be booted in this process, and a trigger failure must never break the write.
  public static async onEvent(churchId: string, event: string, payload: any): Promise<void> {
    try {
      if (!churchId || !payload) return;
      const repos = await RepoManager.getRepos<Repos>("doing");
      const types = await EventTriggerHelper.eventTypesForChurch(churchId, repos);
      if (!types.has(event)) return; // cheap cached gate

      const triggers = (await repos.workflowTrigger.loadByEventType(churchId, event)) as WorkflowTrigger[];
      if (triggers.length === 0) return;

      // Most events resolve to one subject; some (e.g. multi-person form posts) to several.
      const resolved = await EventTriggerHelper.resolve(churchId, event, payload);
      for (const { subject, facts } of resolved) {
        for (const t of triggers) {
          if (!t.workflowId) continue;
          if (!EventTriggerHelper.matches(facts, EventTriggerHelper.parseConditions(t.conditions))) continue;
          if (EventTriggerHelper.toBool(t.oncePerSubject) && subject.id
            && (await repos.task.loadBySubjectInWorkflow(churchId, t.workflowId, subject.type, subject.id))) continue;
          if (subject.type === "person" && subject.id && !subject.label) {
            const people = await getMembershipModuleGateway().loadPeople(churchId, [subject.id]);
            subject.label = people[0]?.displayName;
          }
          const card = (await WorkflowHelper.addToWorkflow(
            churchId, t.workflowId, subject, { type: "system", label: "Trigger" }, undefined, repos, t.stepId || undefined
          )) as Task | null;
          if (card) {
            card.triggerId = t.id;
            await repos.task.save(card);
          }
        }
      }
    } catch {
      // doing not reachable / transient — never break the originating write
    }
  }

  // Per-record-type logic: load related records (cross-module via gateways), then
  // return the card subject(s) + a flat facts map. One case per event; [] = no subject.
  private static async resolve(churchId: string, event: string, payload: any): Promise<{ subject: Subject; facts: Record<string, any> }[]> {
    switch (event) {
      case "person.created":
      case "person.updated":
        return [{
          subject: { type: "person", id: payload.id, label: payload.displayName },
          facts: {
            "person.membershipStatus": payload.membershipStatus,
            "person.gender": payload.gender,
            "person.maritalStatus": payload.maritalStatus
          }
        }];

      case "donation.created": {
        if (!payload.personId) return []; // anonymous donation has no subject
        const person = await getMembershipModuleGateway().loadPerson(churchId, payload.personId);
        const funds = await getGivingModuleGateway().loadFundDonations(churchId, payload.id);
        return [{
          subject: { type: "person", id: payload.personId },
          facts: {
            "donation.amount": payload.amount,
            "donation.method": payload.method,
            "person.membershipStatus": person?.membershipStatus,
            "fundDonation.fundId": funds.map((f) => f.fundId)
          }
        }];
      }

      case "group.member.added": {
        const group = await getMembershipModuleGateway().loadGroup(churchId, payload.groupId);
        return [{
          subject: { type: "person", id: payload.personId },
          facts: { "group.id": payload.groupId, "group.name": group?.name }
        }];
      }

      case "group.created":
        return [{
          subject: { type: "group", id: payload.id, label: payload.name },
          facts: { "group.name": payload.name, "group.categoryName": payload.categoryName }
        }];

      case "form.submission.created": {
        // payload is a submission (or, defensively, an array of them). The subject is
        // the person the submission is about (contentType "person").
        const subs = Array.isArray(payload) ? payload : [payload];
        const out: { subject: Subject; facts: Record<string, any> }[] = [];
        for (const sub of subs) {
          if (sub?.contentType !== "person" || !sub.contentId) continue;
          const person = await getMembershipModuleGateway().loadPerson(churchId, sub.contentId);
          out.push({
            subject: { type: "person", id: sub.contentId },
            facts: { "formSubmission.formId": sub.formId, "person.membershipStatus": person?.membershipStatus }
          });
        }
        return out;
      }

      default:
        return [];
    }
  }

  public static matches(facts: Record<string, any>, node: FilterNode | null): boolean {
    if (!node) return true;
    if (node.type === "group") {
      const children = node.children || [];
      if (children.length === 0) return true;
      return node.conjunction === "OR"
        ? children.some((c) => EventTriggerHelper.matches(facts, c))
        : children.every((c) => EventTriggerHelper.matches(facts, c));
    }
    const actual = facts[node.field];
    const test = (a: any) => EventTriggerHelper.compare(a, node.operator, node.value);
    return Array.isArray(actual) ? actual.some(test) : test(actual);
  }

  private static compare(actual: any, operator: string, value: string): boolean {
    const missing = actual === null || actual === undefined;
    switch (operator) {
      case "=": return !missing && String(actual) === String(value);
      case "!=": return missing || String(actual) !== String(value);
      case "contains": return !missing && String(actual).toLowerCase().includes(String(value).toLowerCase());
      case ">": return !missing && Number(actual) > Number(value);
      case "<": return !missing && Number(actual) < Number(value);
      case ">=": return !missing && Number(actual) >= Number(value);
      case "<=": return !missing && Number(actual) <= Number(value);
      case "in": return !missing && EventTriggerHelper.toList(value).includes(String(actual));
      case "notIn": return missing || !EventTriggerHelper.toList(value).includes(String(actual));
      default: return false;
    }
  }

  private static toList(value: string): string[] {
    return String(value || "").split(",").map((v) => v.trim()).filter(Boolean);
  }

  private static parseConditions(json?: string): FilterNode | null {
    if (!json) return null;
    try {
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === "object" ? (parsed as FilterNode) : null;
    } catch {
      return null;
    }
  }

  // bit(1) columns can come back as Buffer / number / boolean depending on the driver.
  private static toBool(v: any): boolean {
    if (v === null || v === undefined) return true; // oncePerSubject defaults true
    if (Buffer.isBuffer(v)) return v[0] === 1;
    if (typeof v === "number") return v === 1;
    if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
    return !!v;
  }

  private static async eventTypesForChurch(churchId: string, repos: Repos): Promise<Set<string>> {
    const entry = EventTriggerHelper.cache.get(churchId);
    if (entry && entry.expires > Date.now()) return entry.types;
    const types = new Set(await repos.workflowTrigger.loadEventTypesForChurch(churchId));
    EventTriggerHelper.cache.set(churchId, { types, expires: Date.now() + EventTriggerHelper.TTL_MS });
    return types;
  }
}
