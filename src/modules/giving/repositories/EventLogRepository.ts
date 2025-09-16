import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { EventLog } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class EventLogRepository extends ConfiguredRepository<EventLog> {
  protected get repoConfig(): RepoConfig<EventLog> {
    return {
      tableName: "eventLogs",
      hasSoftDelete: false,
      idColumn: "id", // External ID from payment provider events
      insertColumns: ["customerId", "provider", "eventType", "message", "status", "created"],
      updateColumns: ["resolved"],
      insertLiterals: {
        resolved: "FALSE" // Always false on insert
      }
    };
  }

  // Override create to use external ID and handle resolved field
  protected async create(model: EventLog): Promise<EventLog> {
    const sql = "INSERT INTO eventLogs (id, churchId, customerId, provider, eventType, message, status, created, resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [model.id, model.churchId, model.customerId, model.provider, model.eventType, model.message, model.status, model.created, false];
    await DB.query(sql, params);
    return model;
  }

  // Override save to check if event already exists (idempotency)
  public async save(eventLog: EventLog) {
    const event = await this.load(eventLog.churchId as string, eventLog.id);
    return event ? this.update(eventLog) : this.create(eventLog);
  }

  public async loadByType(churchId: string, status: string) {
    return DB.query(
      "SELECT eventLogs.*, personId FROM customers LEFT JOIN eventLogs ON customers.id = eventLogs.customerId WHERE eventLogs.status=? AND eventLogs.churchId=? ORDER BY eventLogs.created DESC;",
      [status, churchId]
    );
  }

  protected rowToModel(row: any): EventLog {
    return { ...row };
  }
}
