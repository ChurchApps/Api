import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { EventLog } from "../models/index.js";

// MySQL duplicate-key (errno 1062 / ER_DUP_ENTRY) surfaced through mysql2/kysely.
export function isDuplicateKeyError(err: unknown): boolean {
  const e = err as { errno?: number; code?: string; message?: string } | null | undefined;
  return e?.errno === 1062
    || e?.code === "ER_DUP_ENTRY"
    || /duplicate entry/i.test(e?.message || "");
}

@injectable()
export class EventLogRepo {

  public async save(eventLog: EventLog) {
    if (eventLog.providerId) {
      const existingEvent = await this.loadByProviderId(eventLog.churchId as string, eventLog.providerId);
      if (existingEvent) {
        return this.update({ ...eventLog, id: existingEvent.id });
      }
    }
    // B1Admin's resolve toggle posts { id, resolved } with no providerId.
    if (eventLog.id) return this.update(eventLog);
    return this.create(eventLog);
  }

  // A duplicate providerId throws (ER_DUP_ENTRY): the caller that loses the race must not process the event again.
  private async create(model: EventLog): Promise<EventLog> {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("eventLogs").values({
      id: model.id,
      churchId: model.churchId,
      customerId: model.customerId,
      provider: model.provider,
      providerId: model.providerId,
      eventType: model.eventType,
      message: model.message,
      status: model.status,
      created: model.created,
      resolved: false
    }).execute();
    return model;
  }

  private async update(model: EventLog): Promise<EventLog> {
    await getDb().updateTable("eventLogs").set({ resolved: model.resolved }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("eventLogs").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("eventLogs").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByProviderId(churchId: string, providerId: string): Promise<EventLog | null> {
    const row = (await getDb().selectFrom("eventLogs").selectAll()
      .where("churchId", "=", churchId)
      .where("providerId", "=", providerId)
      .limit(1)
      .executeTakeFirst()) ?? null;
    return row ? this.rowToModel(row) : null;
  }

  public async loadByType(churchId: string, status: string): Promise<EventLog[]> {
    const result = await sql<EventLog>`
      SELECT eventLogs.*, customers.personId
      FROM eventLogs
      LEFT JOIN customers ON customers.id = eventLogs.customerId AND customers.churchId = eventLogs.churchId
      WHERE eventLogs.status = ${status}
        AND eventLogs.churchId = ${churchId}
      ORDER BY eventLogs.created DESC`.execute(getDb());
    return result.rows;
  }

  public async loadAll(churchId: string): Promise<EventLog[]> {
    return getDb().selectFrom("eventLogs").selectAll().where("churchId", "=", churchId).orderBy("created", "desc").execute();
  }

  public convertToModel(_churchId: string, data: EventLog) {
    return data ? this.rowToModel(data) : null;
  }

  public convertAllToModel(_churchId: string, data: EventLog[]) {
    return data.map((d) => this.rowToModel(d));
  }

  private rowToModel(row: EventLog): EventLog {
    return { ...row };
  }
}
