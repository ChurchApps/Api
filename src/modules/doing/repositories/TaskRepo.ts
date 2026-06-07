import { injectable } from "inversify";
import { sql } from "kysely";
import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
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
      dateClosed: (task.dateClosed ? DateHelper.toMysqlDate(task.dateClosed) : task.dateClosed) as any,
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
      triggerId: task.triggerId,
      conversationId: task.conversationId,
      data: task.data,
      workflowId: task.workflowId,
      stepId: task.stepId,
      dueDate: (task.dueDate ? DateHelper.toMysqlDate(task.dueDate) : task.dueDate) as any,
      snoozedUntil: (task.snoozedUntil ? DateHelper.toMysqlDate(task.snoozedUntil) : task.snoozedUntil) as any,
      sort: task.sort,
      pinnedAssignment: task.pinnedAssignment ?? false
    }).execute();
    return task;
  }

  private async update(task: Task): Promise<Task> {
    // dateCreated is an immutable creation timestamp; don't overwrite it on
    // update. The client can send it back as an ISO string, which MySQL
    // rejects ("Incorrect datetime value") when assigned to a DATETIME column.
    await getDb().updateTable("tasks").set({
      taskType: task.taskType,
      dateClosed: (task.dateClosed ? DateHelper.toMysqlDate(task.dateClosed) : task.dateClosed) as any,
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
      triggerId: task.triggerId,
      conversationId: task.conversationId,
      data: task.data,
      workflowId: task.workflowId,
      stepId: task.stepId,
      dueDate: (task.dueDate ? DateHelper.toMysqlDate(task.dueDate) : task.dueDate) as any,
      snoozedUntil: (task.snoozedUntil ? DateHelper.toMysqlDate(task.snoozedUntil) : task.snoozedUntil) as any,
      sort: task.sort,
      pinnedAssignment: task.pinnedAssignment ?? false
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

  // Dedup for scheduled rules: which of these subjects already have a card from this
  // trigger within the recurs window? Mirrors the old automation dedup, keyed on triggerId.
  public async loadByTriggerIdContent(churchId: string, triggerId: string, recurs: string, associatedWithType: string, associatedWithIds: string[]) {
    if (associatedWithIds.length === 0) return [];
    let query = getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where("triggerId", "=", triggerId)
      .where("associatedWithType", "=", associatedWithType)
      .where("associatedWithId", "in", associatedWithIds);
    const threshold = new Date();
    switch (recurs) {
      case "yearly": threshold.setFullYear(threshold.getFullYear() - 1); query = query.where("dateCreated", ">", threshold); break;
      case "monthly": threshold.setMonth(threshold.getMonth() - 1); query = query.where("dateCreated", ">", threshold); break;
      case "weekly": threshold.setDate(threshold.getDate() - 7); query = query.where("dateCreated", ">", threshold); break;
      case "daily": threshold.setDate(threshold.getDate() - 1); query = query.where("dateCreated", ">", threshold); break;
      default: break; // no repeat: any prior card from this trigger dedups
    }
    return query.orderBy("taskNumber").execute();
  }

  // Dedup for oncePerSubject event triggers: is this subject already in this workflow
  // (any status)? Keyed on workflow+subject, not the trigger, so a "create" and a
  // later "edit-to-Visitor" — two triggers feeding one workflow — add the person once.
  public async loadBySubjectInWorkflow(churchId: string, workflowId: string, associatedWithType: string, associatedWithId: string) {
    return (await getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where("workflowId", "=", workflowId)
      .where("associatedWithType", "=", associatedWithType)
      .where("associatedWithId", "=", associatedWithId)
      .executeTakeFirst()) ?? null;
  }

  private async loadNextTaskNumber(churchId: string) {
    const result = (await getDb().selectFrom("tasks")
      .select(sql`max(ifnull(taskNumber, 0)) + 1`.as("taskNumber"))
      .where("churchId", "=", churchId)
      .executeTakeFirst()) ?? null;
    return (result as any)?.taskNumber ?? 1;
  }

  // Plain-task lists exclude cards (workflowId set); cards have the board / my-cards.
  public async loadForPerson(churchId: string, personId: string, status: string) {
    return getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where("workflowId", "is", null)
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
      .where("workflowId", "is", null)
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

  public async loadByWorkflow(churchId: string, workflowId: string, status = "Open") {
    return getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where("workflowId", "=", workflowId)
      .where("status", "=", status)
      .orderBy("sort")
      .orderBy("taskNumber")
      .execute();
  }

  public async loadCardsForPerson(churchId: string, personId: string, status = "Open") {
    return getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where("workflowId", "is not", null)
      .where("status", "=", status)
      .where((eb) =>
        eb.and([eb("assignedToType", "=", "person"), eb("assignedToId", "=", personId)]))
      .orderBy("dueDate")
      .execute();
  }

  public async loadMaxSortForStep(churchId: string, workflowId: string, stepId: string) {
    const result = (await getDb().selectFrom("tasks")
      .select(sql`max(ifnull(sort, 0)) + 1`.as("sort"))
      .where("churchId", "=", churchId)
      .where("workflowId", "=", workflowId)
      .where("stepId", "=", stepId)
      .executeTakeFirst()) ?? null;
    return (result as any)?.sort ?? 1;
  }

  public async loadOverdueAllChurches() {
    return getDb().selectFrom("tasks").selectAll()
      .where("workflowId", "is not", null)
      .where("status", "=", "Open")
      .where("dueDate", "is not", null)
      .where("dueDate", "<", sql`now()` as any)
      .where((eb) => eb.or([eb("snoozedUntil", "is", null), eb("snoozedUntil", "<", sql`now()` as any)]))
      .execute();
  }

  public async loadSnoozedDueAllChurches() {
    return getDb().selectFrom("tasks").selectAll()
      .where("workflowId", "is not", null)
      .where("status", "=", "Open")
      .where("snoozedUntil", "is not", null)
      .where("snoozedUntil", "<=", sql`now()` as any)
      .execute();
  }

  public async countByStep(churchId: string, workflowId: string) {
    return getDb().selectFrom("tasks")
      .select("stepId")
      .select(sql`count(*)`.as("count"))
      .where("churchId", "=", churchId)
      .where("workflowId", "=", workflowId)
      .where("status", "=", "Open")
      .groupBy("stepId")
      .execute();
  }

  public async loadOverdue(churchId: string, workflowId: string) {
    return getDb().selectFrom("tasks").selectAll()
      .where("churchId", "=", churchId)
      .where("workflowId", "=", workflowId)
      .where("status", "=", "Open")
      .where("dueDate", "is not", null)
      .where("dueDate", "<", sql`now()` as any)
      .where((eb) => eb.or([eb("snoozedUntil", "is", null), eb("snoozedUntil", "<", sql`now()` as any)]))
      .orderBy("dueDate")
      .execute();
  }

  public async throughput(churchId: string, workflowId: string, since: Date) {
    return getDb().selectFrom("tasks")
      .select(sql`date(dateClosed)`.as("day"))
      .select(sql`count(*)`.as("count"))
      .where("churchId", "=", churchId)
      .where("workflowId", "=", workflowId)
      .where("status", "=", "Closed")
      .where("dateClosed", ">=", DateHelper.toMysqlDate(since) as any)
      .groupBy(sql`date(dateClosed)`)
      .orderBy(sql`date(dateClosed)`)
      .execute();
  }
}
