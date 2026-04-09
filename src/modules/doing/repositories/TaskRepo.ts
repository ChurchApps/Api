import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Task } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class TaskRepo {
  public async save(model: Task) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(task: Task): Promise<Task> {
    task.id = task.id || UniqueIdHelper.shortId();
    const taskNumber = await this.loadNextTaskNumber(task.churchId || ""); // NOTE - This is problematic if saving multiple records asyncronously.  Be sure to await each call

    await getDb().insertInto("tasks").values({
      id: task.id,
      churchId: task.churchId,
      taskNumber: taskNumber,
      taskType: task.taskType,
      dateCreated: sql`now()` as any,
      dateClosed: task.dateClosed,
      associatedWithType: task.associatedWithType,
      associatedWithId: task.associatedWithId,
      associatedWithLabel: task.associatedWithLabel,
      createdByType: task.createdByType,
      createdById: task.createdById,
      createdByLabel: task.createdByLabel,
      assignedToType: task.assignedToType,
      assignedToId: task.assignedToId,
      assignedToLabel: task.assignedToLabel,
      title: task.title,
      status: task.status,
      automationId: task.automationId,
      conversationId: task.conversationId,
      data: task.data
    }).execute();
    return task;
  }

  private async update(task: Task): Promise<Task> {
    await getDb().updateTable("tasks").set({
      taskType: task.taskType,
      dateCreated: task.dateCreated,
      dateClosed: task.dateClosed,
      associatedWithType: task.associatedWithType,
      associatedWithId: task.associatedWithId,
      associatedWithLabel: task.associatedWithLabel,
      createdByType: task.createdByType,
      createdById: task.createdById,
      createdByLabel: task.createdByLabel,
      assignedToType: task.assignedToType,
      assignedToId: task.assignedToId,
      assignedToLabel: task.assignedToLabel,
      title: task.title,
      status: task.status,
      automationId: task.automationId,
      conversationId: task.conversationId,
      data: task.data
    }).where("id", "=", task.id).where("churchId", "=", task.churchId).execute();
    return task;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("tasks").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("tasks").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("tasks").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadTimeline(churchId: string, personId: string, taskIds: string[]) {
    const query = getDb().selectFrom("tasks")
      .selectAll()
      .select(sql`'task'`.as("postType"))
      .select("id as postId")
      .where("churchId", "=", churchId)
      .where((eb) => {
        const openCondition = eb.and([
          eb("status", "=", "Open"),
          eb.or([
            eb.and([eb("associatedWithType", "=", "person"), eb("associatedWithId", "=", personId)]),
            eb.and([eb("createdByType", "=", "person"), eb("createdById", "=", personId)]),
            eb.and([eb("assignedToType", "=", "person"), eb("assignedToId", "=", personId)])
          ])
        ]);
        if (taskIds.length > 0) {
          return eb.or([openCondition, eb("id", "in", taskIds)]);
        }
        return openCondition;
      });

    return query.execute();
  }

  public async loadByAutomationIdContent(churchId: string, automationId: string, recurs: string, associatedWithType: string, associatedWithIds: string[]) {
    if (associatedWithIds.length === 0) return [];
    let result: any[] = [];
    switch (recurs) {
      case "yearly":
        result = await this.loadByAutomationIdContentYearly(churchId, automationId, associatedWithType, associatedWithIds);
        break;
      case "monthly":
        result = await this.loadByAutomationIdContentMonthly(churchId, automationId, associatedWithType, associatedWithIds);
        break;
      case "weekly":
        result = await this.loadByAutomationIdContentWeekly(churchId, automationId, associatedWithType, associatedWithIds);
        break;
      default:
        result = await this.loadByAutomationIdContentNoRepeat(churchId, automationId, associatedWithType, associatedWithIds);
        break;
    }
    return result;
  }

  private async loadByAutomationIdContentNoRepeat(churchId: string, automationId: string, associatedWithType: string, associatedWithIds: string[]) {
    return getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where("automationId", "=", automationId)
      .where("associatedWithType", "=", associatedWithType)
      .where("associatedWithId", "in", associatedWithIds)
      .orderBy("taskNumber")
      .execute();
  }

  private async loadByAutomationIdContentYearly(churchId: string, automationId: string, associatedWithType: string, associatedWithIds: string[]) {
    const threshold = new Date();
    threshold.setFullYear(threshold.getFullYear() - 1);
    return getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where("automationId", "=", automationId)
      .where("associatedWithType", "=", associatedWithType)
      .where("associatedWithId", "in", associatedWithIds)
      .where("dateCreated", ">", threshold)
      .orderBy("taskNumber")
      .execute();
  }

  private async loadByAutomationIdContentMonthly(churchId: string, automationId: string, associatedWithType: string, associatedWithIds: string[]) {
    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - 1);
    return getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where("automationId", "=", automationId)
      .where("associatedWithType", "=", associatedWithType)
      .where("associatedWithId", "in", associatedWithIds)
      .where("dateCreated", ">", threshold)
      .orderBy("taskNumber")
      .execute();
  }

  private async loadByAutomationIdContentWeekly(churchId: string, automationId: string, associatedWithType: string, associatedWithIds: string[]) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 7);
    return getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where("automationId", "=", automationId)
      .where("associatedWithType", "=", associatedWithType)
      .where("associatedWithId", "in", associatedWithIds)
      .where("dateCreated", ">", threshold)
      .orderBy("taskNumber")
      .execute();
  }

  private async loadNextTaskNumber(churchId: string) {
    const result = (await getDb().selectFrom("tasks")
      .select(sql`max(ifnull(taskNumber, 0)) + 1`.as("taskNumber"))
      .where("churchId", "=", churchId)
      .executeTakeFirst()) ?? null;
    return (result as any)?.taskNumber ?? 1;
  }

  public async loadForPerson(churchId: string, personId: string, status: string) {
    return getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where((eb) =>
        eb.or([
          eb.and([eb("assignedToType", "=", "person"), eb("assignedToId", "=", personId)]),
          eb.and([eb("createdByType", "=", "person"), eb("createdById", "=", personId)])
        ]))
      .where("status", "=", status)
      .orderBy("taskNumber")
      .execute();
  }

  public async loadForGroups(churchId: string, groupIds: string[], status: string) {
    if (groupIds.length === 0) return [];
    return getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where((eb) =>
        eb.or([
          eb.and([eb("assignedToType", "=", "group"), eb("assignedToId", "in", groupIds)]),
          eb.and([eb("createdByType", "=", "group"), eb("createdById", "in", groupIds)])
        ]))
      .where("status", "=", status)
      .orderBy("taskNumber")
      .execute();
  }

  public async loadForDirectoryUpdate(churchId: string, personId: string) {
    return getDb().selectFrom("tasks").selectAll()
      .where("taskType", "=", "directoryUpdate")
      .where("status", "=", "Open")
      .where("churchId", "=", churchId)
      .where("associatedWithId", "=", personId)
      .execute();
  }
}
