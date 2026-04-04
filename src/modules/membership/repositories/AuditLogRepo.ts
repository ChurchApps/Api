import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { AuditLog } from "../models/index.js";

export interface AuditLogFilter {
  category?: string;
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
      created: sql`NOW()` as any
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
      ipAddress: log.ipAddress
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
    if (filter.userId) query = query.where("userId", "=", filter.userId);
    if (filter.entityType) query = query.where("entityType", "=", filter.entityType);
    if (filter.entityId) query = query.where("entityId", "=", filter.entityId);
    if (filter.startDate) query = query.where("created", ">=", filter.startDate as any);
    if (filter.endDate) query = query.where("created", "<=", filter.endDate as any);

    const limit = Math.max(1, Math.min(filter.limit || 100, 1000));
    const offset = Math.max(0, filter.offset || 0);

    const results = await query.orderBy("created", "desc").limit(limit).offset(offset).execute();
    return results as AuditLog[];
  }

  public async loadForPerson(churchId: string, personId: string, limit: number = 100, offset: number = 0): Promise<AuditLog[]> {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const safeOffset = Math.max(0, offset);
    const results = await sql`SELECT al.* FROM auditLogs al
      WHERE al.churchId=${churchId} AND (al.userId=${personId} OR (al.entityType='person' AND al.entityId=${personId}))
      ORDER BY al.created DESC LIMIT ${sql.raw(String(safeLimit))} OFFSET ${sql.raw(String(safeOffset))}`.execute(getDb());
    return results.rows as AuditLog[];
  }

  public async loadCount(churchId: string, filter: AuditLogFilter): Promise<number> {
    const conditions: string[] = ["churchId=?"];
    const params: any[] = [churchId];

    if (filter.category) { conditions.push("category=?"); params.push(filter.category); }
    if (filter.userId) { conditions.push("userId=?"); params.push(filter.userId); }
    if (filter.entityType) { conditions.push("entityType=?"); params.push(filter.entityType); }
    if (filter.entityId) { conditions.push("entityId=?"); params.push(filter.entityId); }
    if (filter.startDate) { conditions.push("created>=?"); params.push(filter.startDate); }
    if (filter.endDate) { conditions.push("created<=?"); params.push(filter.endDate); }

    const sqlStr = sql.raw(`SELECT COUNT(*) as count FROM auditLogs WHERE ${conditions.join(" AND ")}`);
    const result = await sql`${sqlStr}`.execute(getDb());
    const row = (result.rows as any[])?.[0];
    return row?.count || 0;
  }

  public async deleteOld(days: number = 365): Promise<void> {
    await sql`DELETE FROM auditLogs WHERE created < DATE_SUB(NOW(), INTERVAL ${sql.raw(String(days))} DAY)`.execute(getDb());
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
