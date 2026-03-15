import { injectable } from "inversify";
import { eq, and, gte, lte, lt, or, count, desc } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { auditLogs } from "../../../db/schema/membership.js";
import { AuditLog } from "../models/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";

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

  private buildFilterConditions(churchId: string, filter: AuditLogFilter) {
    const conditions: any[] = [eq(auditLogs.churchId, churchId)];
    if (filter.category) conditions.push(eq(auditLogs.category, filter.category));
    if (filter.userId) conditions.push(eq(auditLogs.userId, filter.userId));
    if (filter.entityType) conditions.push(eq(auditLogs.entityType, filter.entityType));
    if (filter.entityId) conditions.push(eq(auditLogs.entityId, filter.entityId));
    if (filter.startDate) conditions.push(gte(auditLogs.created, filter.startDate));
    if (filter.endDate) conditions.push(lte(auditLogs.created, filter.endDate));
    return conditions;
  }

  public async loadFiltered(churchId: string, filter: AuditLogFilter): Promise<AuditLog[]> {
    const conditions = this.buildFilterConditions(churchId, filter);
    const limitVal = Math.max(1, Math.min(filter.limit || 100, 1000));
    const offsetVal = Math.max(0, filter.offset || 0);

    return this.db.select().from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.created))
      .limit(limitVal)
      .offset(offsetVal) as Promise<AuditLog[]>;
  }

  public async loadForPerson(churchId: string, personId: string, limit: number = 100, offset: number = 0): Promise<AuditLog[]> {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const safeOffset = Math.max(0, offset);
    return this.db.select().from(auditLogs)
      .where(and(
        eq(auditLogs.churchId, churchId),
        or(eq(auditLogs.userId, personId), and(eq(auditLogs.entityType, "person"), eq(auditLogs.entityId, personId)))
      ))
      .orderBy(desc(auditLogs.created))
      .limit(safeLimit)
      .offset(safeOffset) as Promise<AuditLog[]>;
  }

  public async loadCount(churchId: string, filter: AuditLogFilter): Promise<number> {
    const conditions = this.buildFilterConditions(churchId, filter);
    const rows = await this.db.select({ count: count() }).from(auditLogs)
      .where(and(...conditions));
    return rows[0]?.count || 0;
  }

  public async deleteOld(days: number = 365): Promise<void> {
    await this.db.delete(auditLogs).where(lt(auditLogs.created, DateHelper.daysFromNow(-days)));
  }
}
