import { injectable } from "inversify";
import { eq, and, inArray, gt, or, asc, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { tasks } from "../../../db/schema/doing.js";
import { Task } from "../models/index.js";

@injectable()
export class TaskRepo extends DrizzleRepo<typeof tasks> {
  protected readonly table = tasks;
  protected readonly moduleName = "doing";

  public override async save(model: Task) {
    if (model.id) {
      const { id: _id, churchId: _cid, taskNumber: _tn, ...setData } = model as any;
      await this.db.update(tasks).set(setData).where(and(eq(tasks.id, model.id), eq(tasks.churchId, model.churchId)));
    } else {
      model.id = UniqueIdHelper.shortId();
      const taskNumber = await this.loadNextTaskNumber(model.churchId || "");
      const data = { ...model, taskNumber, dateCreated: new Date() } as any;
      await this.db.insert(tasks).values(data);
      return data as Task;
    }
    return model;
  }

  public override load(churchId: string, id: string) {
    return this.db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.churchId, churchId))).orderBy(asc(tasks.taskNumber)).then(r => r[0] ?? null);
  }

  public async loadTimeline(churchId: string, personId: string, taskIds: string[]) {
    const personCondition = and(
      eq(tasks.churchId, churchId),
      eq(tasks.status, "Open"),
      or(
        and(eq(tasks.associatedWithType, "person"), eq(tasks.associatedWithId, personId)),
        and(eq(tasks.createdByType, "person"), eq(tasks.createdById, personId)),
        and(eq(tasks.assignedToType, "person"), eq(tasks.assignedToId, personId))
      )
    );

    if (taskIds.length > 0) {
      return this.db.select().from(tasks).where(or(personCondition, inArray(tasks.id, taskIds)));
    }
    return this.db.select().from(tasks).where(personCondition);
  }

  public async loadByAutomationIdContent(churchId: string, automationId: string, recurs: string, associatedWithType: string, associatedWithIds: string[]) {
    let threshold: Date | null = null;
    switch (recurs) {
      case "yearly":
        threshold = new Date();
        threshold.setFullYear(threshold.getFullYear() - 1);
        break;
      case "monthly":
        threshold = new Date();
        threshold.setMonth(threshold.getMonth() - 1);
        break;
      case "weekly":
        threshold = new Date();
        threshold.setDate(threshold.getDate() - 7);
        break;
    }

    const baseCondition = and(
      eq(tasks.churchId, churchId),
      eq(tasks.automationId, automationId),
      eq(tasks.associatedWithType, associatedWithType),
      inArray(tasks.associatedWithId, associatedWithIds)
    );

    if (threshold) {
      return this.db.select().from(tasks).where(and(baseCondition, gt(tasks.dateCreated, threshold))).orderBy(asc(tasks.taskNumber));
    }
    return this.db.select().from(tasks).where(baseCondition).orderBy(asc(tasks.taskNumber));
  }

  private async loadNextTaskNumber(churchId: string) {
    const result = await this.db.select({ taskNumber: sql<number>`max(COALESCE(${tasks.taskNumber}, 0)) + 1` }).from(tasks).where(eq(tasks.churchId, churchId));
    return result[0]?.taskNumber ?? 1;
  }

  public loadForPerson(churchId: string, personId: string, status: string) {
    return this.db.select().from(tasks)
      .where(and(
        eq(tasks.churchId, churchId),
        eq(tasks.status, status),
        or(
          and(eq(tasks.assignedToType, "person"), eq(tasks.assignedToId, personId)),
          and(eq(tasks.createdByType, "person"), eq(tasks.createdById, personId))
        )
      ))
      .orderBy(asc(tasks.taskNumber));
  }

  public async loadForGroups(churchId: string, groupIds: string[], status: string) {
    if (groupIds.length === 0) return [];
    return this.db.select().from(tasks)
      .where(and(
        eq(tasks.churchId, churchId),
        eq(tasks.status, status),
        or(
          and(eq(tasks.assignedToType, "group"), inArray(tasks.assignedToId, groupIds)),
          and(eq(tasks.createdByType, "group"), inArray(tasks.createdById, groupIds))
        )
      ))
      .orderBy(asc(tasks.taskNumber));
  }

  public loadForDirectoryUpdate(churchId: string, personId: string) {
    return this.db.select().from(tasks)
      .where(and(eq(tasks.taskType, "directoryUpdate"), eq(tasks.status, "Open"), eq(tasks.churchId, churchId), eq(tasks.associatedWithId, personId)));
  }
}
