import { RepoManager } from "../../../../shared/infrastructure/RepoManager.js";
import { singleDateOccurrence } from "../../../../shared/helpers/CivilDate.js";
import { DoingRepos, ForeignTaskRow } from "../ForeignRepos.js";
import { ReminderAdapter, ReminderOccurrenceInfo, ReminderRecipient } from "../ReminderAdapter.js";

// Task adapter (architecture §6.3) — "N days before due", single assignee.
export const TaskReminderAdapter: ReminderAdapter<ForeignTaskRow> = {
  entityType: "task",
  category: "tasks",
  contentType: "task",

  async loadEntity(churchId: string, entityId: string) {
    const doing = await RepoManager.getRepos<DoingRepos>("doing");
    return (await doing.task.load(churchId, entityId)) ?? null;
  },

  async getOccurrences(entity: ForeignTaskRow, from: Date, to: Date): Promise<ReminderOccurrenceInfo[]> {
    return singleDateOccurrence(entity.dueDate, from, to);
  },

  async loadRecipients(_churchId: string, entity: ForeignTaskRow): Promise<ReminderRecipient[]> {
    if (entity?.assignedToType !== "person" || !entity?.assignedToId) return [];
    return [{ personId: entity.assignedToId }];
  },

  link(entity: ForeignTaskRow) {
    return entity?.id ? `/tasks/${entity.id}` : "";
  },

  renderMessage(entity: ForeignTaskRow, _occLocalISO: string, custom?: string) {
    const title = entity?.title || "a task";
    if (custom) return custom.replace(/\{\{taskTitle\}\}/g, title);
    return `Reminder: "${title}" is due soon`;
  }
};
