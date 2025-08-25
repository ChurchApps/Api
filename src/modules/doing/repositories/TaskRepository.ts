import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Task } from "../models";

@injectable()
export class TaskRepository {
  public save(task: Task) {
    return task.id ? this.update(task) : this.create(task);
  }

  public async loadTimeline(churchId: string, personId: string, taskIds: string[]) {
    let sql =
      "select *, 'task' as postType, id as postId from tasks" +
      " where churchId=? AND (" +
      "   status='Open' and (" +
      "	    (associatedWithType='person' and associatedWithId=?)" +
      "        OR" +
      "        (createdByType='person' and createdById=?)" +
      "        OR" +
      "        (assignedToType='person' and assignedToId=?)" +
      "   )" +
      ")";
    const params: unknown[] = [churchId, personId, personId, personId];
    if (taskIds.length > 0) {
      sql += " OR id IN (?)";
      params.push(taskIds);
    }
    const result = await DB.query(sql, params);
    return result;
  }

  private async create(task: Task) {
    task.id = UniqueIdHelper.shortId();
    const taskNumber = await this.loadNextTaskNumber(task.churchId || ""); // NOTE - This is problematic if saving multiple records asyncronously.  Be sure to await each call

    const sql =
      "INSERT INTO tasks (id, churchId, taskNumber, taskType, dateCreated, dateClosed, associatedWithType, associatedWithId, associatedWithLabel, createdByType, createdById, createdByLabel, assignedToType, assignedToId, assignedToLabel, title, status, automationId, conversationId, data) VALUES (?, ?, ?, ?, now(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      task.id,
      task.churchId,
      taskNumber,
      task.taskType,
      task.dateClosed,
      task.associatedWithType,
      task.associatedWithId,
      task.associatedWithLabel,
      task.createdByType,
      task.createdById,
      task.createdByLabel,
      task.assignedToType,
      task.assignedToId,
      task.assignedToLabel,
      task.title,
      task.status,
      task.automationId,
      task.conversationId,
      task.data
    ];
    await DB.query(sql, params);
    return task;
  }

  private async update(task: Task) {
    const sql =
      "UPDATE tasks SET taskType=?, dateCreated=?, dateClosed=?, associatedWithType=?, associatedWithId=?, associatedWithLabel=?, createdByType=?, createdById=?, createdByLabel=?, assignedToType=?, assignedToId=?, assignedToLabel=?, title=?, status=?, automationId=?, conversationId=?, data=? WHERE id=? and churchId=?";
    const params = [
      task.taskType,
      task.dateCreated,
      task.dateClosed,
      task.associatedWithType,
      task.associatedWithId,
      task.associatedWithLabel,
      task.createdByType,
      task.createdById,
      task.createdByLabel,
      task.assignedToType,
      task.assignedToId,
      task.assignedToLabel,
      task.title,
      task.status,
      task.automationId,
      task.conversationId,
      task.data,
      task.id,
      task.churchId
    ];
    await DB.query(sql, params);
    return task;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM tasks WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM tasks WHERE id=? AND churchId=? order by taskNumber;", [id, churchId]);
  }

  public async loadByAutomationIdContent(churchId: string, automationId: string, recurs: string, associatedWithType: string, associatedWithIds: string[]) {
    let result: any[] = [];
    switch (recurs) {
      case "yearly":
        result = (await this.loadByAutomationIdContentYearly(churchId, automationId, associatedWithType, associatedWithIds)) as any[];
        break;
      case "monthly":
        result = (await this.loadByAutomationIdContentMonthly(churchId, automationId, associatedWithType, associatedWithIds)) as any[];
        break;
      default:
        result = (await this.loadByAutomationIdContentNoRepeat(churchId, automationId, associatedWithType, associatedWithIds)) as any[];
        break;
    }
    return result;
  }

  private async loadByAutomationIdContentNoRepeat(churchId: string, automationId: string, associatedWithType: string, associatedWithIds: string[]) {
    const result = await DB.query("SELECT * FROM tasks WHERE churchId=? AND automationId=? AND associatedWithType=? AND associatedWithId IN (?) order by taskNumber;", [churchId, automationId, associatedWithType, associatedWithIds]);
    return result;
  }

  private async loadByAutomationIdContentYearly(churchId: string, automationId: string, associatedWithType: string, associatedWithIds: string[]) {
    const threshold = new Date();
    threshold.setFullYear(threshold.getFullYear() - 1);
    const result = await DB.query("SELECT * FROM tasks WHERE churchId=? AND automationId=? AND associatedWithType=? AND associatedWithId IN (?) and dateCreated>? order by taskNumber;", [
      churchId,
      automationId,
      associatedWithType,
      associatedWithIds,
      threshold
    ]);
    return result;
  }

  private async loadByAutomationIdContentMonthly(churchId: string, automationId: string, associatedWithType: string, associatedWithIds: string[]) {
    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - 1);
    const result = await DB.query("SELECT * FROM tasks WHERE churchId=? AND automationId=? AND associatedWithType=? AND associatedWithId IN (?) and dateCreated>? order by taskNumber;", [
      churchId,
      automationId,
      associatedWithType,
      associatedWithIds,
      threshold
    ]);
    return result;
  }

  private async loadNextTaskNumber(churchId: string) {
    const result = await DB.queryOne("select max(ifnull(taskNumber, 0)) + 1 as taskNumber from tasks where churchId=?", [churchId]);
    return (result as any).taskNumber;
  }

  public loadForPerson(churchId: string, personId: string, status: string) {
    return DB.query("SELECT * FROM tasks WHERE churchId=? AND ((assignedToType='person' AND assignedToId=?) OR (createdByType='person' AND createdById=?)) and status=? order by taskNumber;", [churchId, personId, personId, status]);
  }

  public async loadForGroups(churchId: string, groupIds: string[], status: string) {
    if (groupIds.length === 0) return [];
    else return DB.query("SELECT * FROM tasks WHERE churchId=? AND ((assignedToType='group' AND assignedToId IN (?)) OR (createdByType='group' AND createdById IN (?))) AND status=? order by taskNumber;", [churchId, groupIds, groupIds, status]);
  }

  public async loadForDirectoryUpdate(churchId: string, personId: string) {
    return DB.query("SELECT * FROM tasks WHERE taskType='directoryUpdate' AND status='Open' AND churchId=? AND associatedWithId=?;", [churchId, personId]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM tasks WHERE churchId=?;", [churchId]);
  }
}
