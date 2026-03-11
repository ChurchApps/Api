import { injectable } from "inversify";
import { eq, and, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { auditLogs } from "../../../db/schema/membership.js";
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

@injectable()
export class AuditLogRepo extends DrizzleRepo<typeof auditLogs> {
  protected readonly table = auditLogs;
  protected readonly moduleName = "membership";

  public async save(model: AuditLog) {
    if (model.id) {
      const { id: _id, churchId: _churchId, ...setData } = model as any;
      await this.db.update(auditLogs).set(setData)
        .where(and(eq(auditLogs.id, model.id), eq(auditLogs.churchId, model.churchId!)));
    } else {
      model.id = UniqueIdHelper.shortId();
      await this.db.insert(auditLogs).values({ ...model, created: new Date() } as any);
    }
    return model;
  }

  public async create(log: AuditLog) {
    log.id = UniqueIdHelper.shortId();
    await this.db.insert(auditLogs).values({ ...log, created: new Date() } as any);
    return log;
  }

  public async loadFiltered(churchId: string, filter: AuditLogFilter): Promise<AuditLog[]> {
    const conditions: any[] = [sql`churchId=${churchId}`];
    if (filter.category) conditions.push(sql`category=${filter.category}`);
    if (filter.userId) conditions.push(sql`userId=${filter.userId}`);
    if (filter.entityType) conditions.push(sql`entityType=${filter.entityType}`);
    if (filter.entityId) conditions.push(sql`entityId=${filter.entityId}`);
    if (filter.startDate) conditions.push(sql`created>=${filter.startDate}`);
    if (filter.endDate) conditions.push(sql`created<=${filter.endDate}`);

    const limit = Math.max(1, Math.min(filter.limit || 100, 1000));
    const offset = Math.max(0, filter.offset || 0);
    const whereClause = sql.join(conditions, sql` AND `);

    return this.executeRows(
      sql`SELECT * FROM auditLogs WHERE ${whereClause} ORDER BY created DESC LIMIT ${limit} OFFSET ${offset}`
    ) as Promise<AuditLog[]>;
  }

  public async loadForPerson(churchId: string, personId: string, limit: number = 100, offset: number = 0): Promise<AuditLog[]> {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const safeOffset = Math.max(0, offset);
    return this.executeRows(sql`
      SELECT al.* FROM auditLogs al
      WHERE al.churchId=${churchId} AND (al.userId=${personId} OR (al.entityType='person' AND al.entityId=${personId}))
      ORDER BY al.created DESC LIMIT ${safeLimit} OFFSET ${safeOffset}
    `) as Promise<AuditLog[]>;
  }

  public async loadCount(churchId: string, filter: AuditLogFilter): Promise<number> {
    const conditions: any[] = [sql`churchId=${churchId}`];
    if (filter.category) conditions.push(sql`category=${filter.category}`);
    if (filter.userId) conditions.push(sql`userId=${filter.userId}`);
    if (filter.entityType) conditions.push(sql`entityType=${filter.entityType}`);
    if (filter.entityId) conditions.push(sql`entityId=${filter.entityId}`);
    if (filter.startDate) conditions.push(sql`created>=${filter.startDate}`);
    if (filter.endDate) conditions.push(sql`created<=${filter.endDate}`);

    const whereClause = sql.join(conditions, sql` AND `);
    const rows = await this.executeRows(
      sql`SELECT COUNT(*) as count FROM auditLogs WHERE ${whereClause}`
    );
    return rows[0]?.count || 0;
  }

  public async deleteOld(days: number = 365): Promise<void> {
    await this.db.execute(sql`DELETE FROM auditLogs WHERE created < DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
  }
}
