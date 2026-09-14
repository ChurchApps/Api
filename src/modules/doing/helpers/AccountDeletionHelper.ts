import { NotificationService } from "../../../shared/helpers/NotificationService.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { Task } from "../models/index.js";

interface Requester {
  churchId: string;
  personId?: string;
  firstName?: string;
  lastName?: string;
}

interface TaskRepos {
  task: {
    save: (task: Task) => Promise<Task>;
    loadOpenAccountDeletions?: () => Promise<Task[]>;
  };
}

export interface AccountDeletionDecision {
  outcome?: string;
  reason?: string;
}

// A member asking to delete their own account files an "accountDeletion" task that the
// church's directory approval group reviews (Serving > Tasks) before anything is erased.
// Review is allowed (identity check + Art. 17(3) exceptions). A silent reject is not:
// staff must give a reason, the member is told either way, and the group is reminded
// before the one-month GDPR response window runs out.
export class AccountDeletionHelper {
  public static readonly taskType = "accountDeletion";
  public static readonly approvalGroupSetting = "directoryApprovalGroupId";
  public static readonly responseDays = 30;
  public static readonly dueDays = 28;
  public static readonly firstReminderDays = 21;
  public static readonly secondReminderDays = 27;
  public static readonly minReasonLength = 10;

  // Shapes a self-service request: the target and author are always the caller (never the
  // client-supplied values), and the task is routed to the approval group. Returns an error
  // when the church has not configured a group, so no request can be filed that nobody would see.
  public static async prepareRequest(au: Requester, task: Task): Promise<{ error?: string }> {
    if (!au.personId) return { error: "No person linked to this login" };
    const gateway = getMembershipModuleGateway();
    const groupId = await gateway.loadSetting(au.churchId, this.approvalGroupSetting);
    if (!groupId) return { error: "This church has not configured an approval group for account deletion requests" };

    const [group, person] = await Promise.all([gateway.loadGroup(au.churchId, groupId), gateway.loadPerson(au.churchId, au.personId)]);
    const displayName = (person as any)?.displayName || [au.firstName, au.lastName].filter(Boolean).join(" ") || "Member";
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + this.dueDays);

    task.id = undefined;
    task.churchId = au.churchId;
    task.taskType = this.taskType;
    task.status = "Open";
    task.dateClosed = undefined;
    task.workflowId = undefined;
    task.stepId = undefined;
    task.associatedWithType = "person";
    task.associatedWithId = au.personId;
    task.associatedWithLabel = displayName;
    task.createdByType = "person";
    task.createdById = au.personId;
    task.createdByLabel = displayName;
    task.assignedToType = "group";
    task.assignedToId = groupId;
    task.assignedToLabel = (group as any)?.name || "";
    task.title = "Account deletion request from " + displayName;
    task.dueDate = dueDate;
    task.data = JSON.stringify({ outcome: "pending" });
    return {};
  }

  public static async notifyReviewers(task: Task): Promise<void> {
    const ids = await this.reviewerIds(task);
    if (ids.length === 0) return;
    const name = task.associatedWithLabel || "a member";
    await this.notify(ids, task, `Account deletion request from ${name}. Please review within ${this.responseDays} days.`, { emailImmediate: true });
  }

  public static async completeDecision(task: Task, body: AccountDeletionDecision, repos: TaskRepos): Promise<{ error?: string; task?: Task }> {
    if (task.taskType !== this.taskType) return { error: "Not an account deletion request" };
    if (task.status !== "Open") return { error: "Request is already closed" };

    const outcome = (body.outcome || "").trim();
    if (outcome !== "approved" && outcome !== "rejected") return { error: "Outcome must be approved or rejected" };

    if (outcome === "rejected") {
      const reason = (body.reason || "").trim();
      if (reason.length < this.minReasonLength) return { error: "A reason is required when declining an account deletion request" };
      const closed = this.closeTask(task, { outcome: "rejected", reason });
      const saved = await repos.task.save(closed);
      await this.notifyRequester(saved, `Your church declined your account deletion request. Reason: ${reason} You can ask again, or complain to a supervisory authority if you disagree.`);
      return { task: saved };
    }

    const personId = task.associatedWithId;
    if (!personId) return { error: "Request is missing the person to erase" };
    const gateway = getMembershipModuleGateway();
    const person = await gateway.loadPerson(task.churchId || "", personId);
    const email = (person as any)?.email || (person as any)?.contactInfo?.email || "";
    try {
      await gateway.anonymizePerson(task.churchId || "", personId);
    } catch (e) {
      return { error: (e as Error)?.message || "The account could not be deleted." };
    }
    const closed = this.closeTask(task, { outcome: "approved" });
    try {
      await this.notifyRequester(closed, "Your church approved your account deletion request. Your personal information has been anonymized and your login has been removed.", email);
    } catch (e) {
      console.error("[AccountDeletionHelper] requester notify failed after anonymize", e);
    }
    const saved = await repos.task.save(closed);
    return { task: saved };
  }

  public static async remindPending(repos: TaskRepos, now = new Date()): Promise<{ reminded: number }> {
    const tasks = await (repos.task.loadOpenAccountDeletions ? repos.task.loadOpenAccountDeletions() : Promise.resolve([]));
    let reminded = 0;
    for (const task of tasks) {
      const ageDays = this.ageDays(task, now);
      const data = this.parseData(task);
      const count = Number(data.reminderCount || 0);
      const due = (count === 0 && ageDays >= this.firstReminderDays) || (count === 1 && ageDays >= this.secondReminderDays);
      if (!due || count >= 2) continue;
      const ids = await this.reviewerIds(task);
      if (ids.length > 0) {
        const name = task.associatedWithLabel || "a member";
        await this.notify(ids, task, `Account deletion request from ${name} is still open and must be decided within ${this.responseDays} days of the request.`, { emailImmediate: true });
      }
      data.reminderCount = count + 1;
      data.remindedAt = now.toISOString();
      task.data = JSON.stringify(data);
      await repos.task.save(task);
      reminded++;
    }
    return { reminded };
  }

  private static closeTask(task: Task, extra: Record<string, unknown>): Task {
    const data = { ...this.parseData(task), ...extra };
    task.status = "Closed";
    task.dateClosed = new Date();
    task.data = JSON.stringify(data);
    return task;
  }

  private static parseData(task: Task): Record<string, any> {
    try { return JSON.parse(task.data || "{}") || {}; } catch { return {}; }
  }

  private static ageDays(task: Task, now: Date): number {
    const created = task.dateCreated ? new Date(task.dateCreated).getTime() : 0;
    if (!created) return 0;
    return (now.getTime() - created) / (24 * 60 * 60 * 1000);
  }

  private static async reviewerIds(task: Task): Promise<string[]> {
    if (task.assignedToType !== "group" || !task.assignedToId || !task.churchId) return [];
    const ids = await getMembershipModuleGateway().loadGroupMemberPersonIds(task.churchId, task.assignedToId);
    return ids.filter((id) => id && id !== task.createdById);
  }

  private static adminLink(task: Task): string {
    const root = (Environment.b1AdminRoot || "https://admin.b1.church").replace(/\/$/, "");
    return task.id ? `${root}/serving/tasks/${task.id}` : root;
  }

  private static async notifyRequester(task: Task, message: string, email?: string): Promise<void> {
    if (!task.createdById) return;
    const options: { emailImmediate: boolean; emailByPerson?: Record<string, { subject: string; html: string }> } = { emailImmediate: true };
    if (email) options.emailByPerson = { [task.createdById]: { subject: message.slice(0, 80), html: `<p>${this.escape(message)}</p>` } };
    await this.notify([task.createdById], task, message, options);
  }

  private static async notify(personIds: string[], task: Task, message: string, options: { emailImmediate?: boolean; emailByPerson?: Record<string, { subject: string; html: string }> }): Promise<void> {
    if (personIds.length === 0) return;
    try {
      await NotificationService.createNotifications(personIds, task.churchId || "", "task", task.id || "", message, this.adminLink(task), undefined, options);
    } catch (e) {
      console.error("[AccountDeletionHelper] notify failed", e);
    }
  }

  private static escape(value: string): string {
    return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] as string));
  }
}
