import { AuditLog } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { rowsToArray } from "../../../shared/helpers/DbArrayHelper.js";

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

export class AuditLogRepo extends ConfiguredRepo<AuditLog> {
  protected get repoConfig(): RepoConfig<AuditLog> {
    return {
      tableName: "auditLogs",
      hasSoftDelete: false,
      columns: ["userId", "category", "action", "entityType", "entityId", "details", "ipAddress"],
      insertLiterals: { created: "NOW()" }
    };
  }

  public async create(log: AuditLog) {
    log.id = this.createId();
    return super.create(log);
  }

  public async loadFiltered(churchId: string, filter: AuditLogFilter): Promise<AuditLog[]> {
    const conditions: string[] = ["churchId=?"];
    const params: any[] = [churchId];

    if (filter.category) {
      conditions.push("category=?");
      params.push(filter.category);
    }
    if (filter.userId) {
      conditions.push("userId=?");
      params.push(filter.userId);
    }
    if (filter.entityType) {
      conditions.push("entityType=?");
      params.push(filter.entityType);
    }
    if (filter.entityId) {
      conditions.push("entityId=?");
      params.push(filter.entityId);
    }
    if (filter.startDate) {
      conditions.push("created>=?");
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      conditions.push("created<=?");
      params.push(filter.endDate);
    }

    const limit = filter.limit || 100;
    const offset = filter.offset || 0;
    const sql = `SELECT * FROM auditLogs WHERE ${conditions.join(" AND ")} ORDER BY created DESC LIMIT ? OFFSET ?;`;
    params.push(limit, offset);
    return rowsToArray(await TypedDB.query(sql, params));
  }

  public async loadForPerson(churchId: string, personId: string, limit: number = 100, offset: number = 0): Promise<AuditLog[]> {
    const sql = `SELECT al.* FROM auditLogs al
      WHERE al.churchId=? AND (al.userId=? OR (al.entityType='person' AND al.entityId=?))
      ORDER BY al.created DESC LIMIT ? OFFSET ?;`;
    return rowsToArray(await TypedDB.query(sql, [churchId, personId, personId, limit, offset]));
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

    const sql = `SELECT COUNT(*) as count FROM auditLogs WHERE ${conditions.join(" AND ")};`;
    const result = await TypedDB.queryOne(sql, params);
    return result?.count || 0;
  }

  public async deleteOld(days: number = 365): Promise<void> {
    const sql = `DELETE FROM auditLogs WHERE created < DATE_SUB(NOW(), INTERVAL ? DAY);`;
    await TypedDB.query(sql, [days]);
  }
}
