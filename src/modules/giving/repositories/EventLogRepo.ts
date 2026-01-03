import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { EventLog } from "../models/index.js";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class EventLogRepo extends ConfiguredRepo<EventLog> {
  protected get repoConfig(): RepoConfig<EventLog> {
    return {
      tableName: "eventLogs",
      hasSoftDelete: false,
      idColumn: "id", // Now char(11) generated ID
      insertColumns: ["customerId", "provider", "providerId", "eventType", "message", "status", "created"],
      updateColumns: ["resolved"],
      insertLiterals: {
        resolved: "FALSE" // Always false on insert
      }
    };
  }

  // Override create to handle generated ID and providerId field
  protected async create(model: EventLog): Promise<EventLog> {
    if (!model.id) model.id = this.createId();
    const sql = "INSERT INTO eventLogs (id, churchId, customerId, provider, providerId, eventType, message, status, created, resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [model.id, model.churchId, model.customerId, model.provider, model.providerId, model.eventType, model.message, model.status, model.created, false];
    await TypedDB.query(sql, params);
    return model;
  }

  // Override save to check if event already exists by providerId (idempotency)
  public async save(eventLog: EventLog) {
    if (eventLog.providerId) {
      const existingEvent = await this.loadByProviderId(eventLog.churchId as string, eventLog.providerId);
      if (existingEvent) {
        return this.update({ ...eventLog, id: existingEvent.id });
      }
    }
    return this.create(eventLog);
  }

  // Load event by provider ID (for idempotency checks)
  public async loadByProviderId(churchId: string, providerId: string): Promise<EventLog | null> {
    const rows = await TypedDB.query(
      "SELECT * FROM eventLogs WHERE churchId=? AND providerId=? LIMIT 1;",
      [churchId, providerId]
    );
    return rows.length > 0 ? this.rowToModel(rows[0]) : null;
  }

  public async loadByType(churchId: string, status: string) {
    return TypedDB.query(
      "SELECT eventLogs.*, personId FROM customers LEFT JOIN eventLogs ON customers.id = eventLogs.customerId WHERE eventLogs.status=? AND eventLogs.churchId=? ORDER BY eventLogs.created DESC;",
      [status, churchId]
    );
  }

  protected rowToModel(row: any): EventLog {
    return { ...row };
  }
}
