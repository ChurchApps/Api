import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { AuditLog } from "../models/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";

export interface AuditLogFilter {
  category?: string;
  module?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class AuditLogRepo {
  public async save(model: AuditLog) {
    return model.id ? this.update(model) : this.create(model);
  }

  public async create(log: AuditLog): Promise<AuditLog> {
    log.id = UniqueIdHelper.shortId();
    await getDb().insertInto("auditLogs").values({
      id: log.id,
      churchId: log.churchId,
      userId: log.userId,
      category: log.category,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      details: log.details,
      ipAddress: log.ipAddress,
      module: log.module,
      batchId: log.batchId,
      // NOW(3): millisecond precision so the undo conflict guard can order sub-second edits.
      created: sql`NOW(3)` as any
    }).execute();
    return log;
  }

  private async update(log: AuditLog): Promise<AuditLog> {
    await getDb().updateTable("auditLogs").set({
      userId: log.userId,
      category: log.category,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      details: log.details,
      ipAddress: log.ipAddress,
      module: log.module,
      batchId: log.batchId
    }).where("id", "=", log.id).where("churchId", "=", log.churchId).execute();
    return log;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("auditLogs").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("auditLogs").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("auditLogs").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadFiltered(churchId: string, filter: AuditLogFilter): Promise<AuditLog[]> {
    let query = getDb().selectFrom("auditLogs").selectAll().where("churchId", "=", churchId);

    if (filter.category) query = query.where("category", "=", filter.category);
    if (filter.module) query = query.where("module", "=", filter.module as any);
    if (filter.userId) query = query.where("userId", "=", filter.userId);
    if (filter.entityType) query = query.where("entityType", "=", filter.entityType);
    if (filter.entityId) query = query.where("entityId", "=", filter.entityId);
    if (filter.startDate) query = query.where("created", ">=", DateHelper.toMysqlDate(filter.startDate) as any);
    if (filter.endDate) query = query.where("created", "<=", DateHelper.toMysqlDate(filter.endDate) as any);

    const limit = Math.max(1, Math.min(filter.limit || 100, 1000));
    const offset = Math.max(0, filter.offset || 0);

    const results = await query.orderBy("created", "desc").limit(limit).offset(offset).execute();
    return results as AuditLog[];
  }

  public async loadForPerson(churchId: string, personId: string, limit: number = 100, offset: number = 0): Promise<AuditLog[]> {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const safeOffset = Math.max(0, offset);
    return getDb().selectFrom("auditLogs as al").selectAll("al")
      .where("al.churchId", "=", churchId)
      .where((eb) => eb.or([
        eb("al.userId", "=", personId),
        eb.and([eb("al.entityType", "=", "person"), eb("al.entityId", "=", personId)])
      ]))
      .orderBy("al.created", "desc")
      .limit(safeLimit)
      .offset(safeOffset)
      .execute() as Promise<AuditLog[]>;
  }

  public async loadCount(churchId: string, filter: AuditLogFilter): Promise<number> {
    let query = getDb().selectFrom("auditLogs").select(sql`COUNT(*)`.as("count")).where("churchId", "=", churchId);

    if (filter.category) query = query.where("category", "=", filter.category);
    if (filter.module) query = query.where("module", "=", filter.module as any);
    if (filter.userId) query = query.where("userId", "=", filter.userId);
    if (filter.entityType) query = query.where("entityType", "=", filter.entityType);
    if (filter.entityId) query = query.where("entityId", "=", filter.entityId);
    if (filter.startDate) query = query.where("created", ">=", DateHelper.toMysqlDate(filter.startDate) as any);
    if (filter.endDate) query = query.where("created", "<=", DateHelper.toMysqlDate(filter.endDate) as any);

    const row = await query.executeTakeFirst();
    return (row as any)?.count || 0;
  }

  public async loadForBatch(churchId: string, batchId: string): Promise<AuditLog[]> {
    return getDb().selectFrom("auditLogs").selectAll()
      .where("churchId", "=", churchId).where("batchId", "=", batchId)
      .orderBy("created", "asc").execute() as Promise<AuditLog[]>;
  }

  // Conflict guard for undo: any later audit entry for the same entity from outside this batch.
  public async hasLaterModification(churchId: string, module: string | undefined, entityType: string | undefined, entityId: string, after: Date, excludeBatchId: string): Promise<boolean> {
    let query = getDb().selectFrom("auditLogs").select("id")
      .where("churchId", "=", churchId)
      .where("entityType", "=", entityType as any)
      .where("entityId", "=", entityId)
      .where("created", ">", (DateHelper.toMysqlDateMs(after) ?? after) as any)
      .where((eb) => eb.or([eb("batchId", "is", null), eb("batchId", "<>", excludeBatchId)]));
    if (module) query = query.where("module", "=", module as any);
    const row = await query.limit(1).executeTakeFirst();
    return !!row;
  }

  public async deleteOld(days: number = 365): Promise<void> {
    await getDb().deleteFrom("auditLogs").where("created", "<", sql`DATE_SUB(NOW(), INTERVAL ${days} DAY)` as any).execute();
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
