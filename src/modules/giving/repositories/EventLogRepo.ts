import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { EventLog } from "../models/index.js";

// MySQL duplicate-key (errno 1062 / ER_DUP_ENTRY) surfaced through mysql2/kysely.
export function isDuplicateKeyError(err: any): boolean {
  return err?.errno === 1062
    || err?.code === "ER_DUP_ENTRY"
    || /duplicate entry/i.test(err?.message || "");
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
    return this.create(eventLog);
  }

  private async create(model: EventLog): Promise<EventLog> {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    try {
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
      } as any).execute();
      return model;
    } catch (err) {
      // A concurrent webhook delivery already inserted this provider event
      // (UNIQUE(churchId, providerId)). Treat as idempotent success and return
      // the winning row instead of 500-ing, which would trigger a retry storm.
      if (isDuplicateKeyError(err) && model.churchId && model.providerId) {
        const existing = await this.loadByProviderId(model.churchId as string, model.providerId);
        if (existing) return existing;
      }
      throw err;
    }
  }

  private async update(model: EventLog): Promise<EventLog> {
    await getDb().updateTable("eventLogs").set({ resolved: model.resolved } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
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

  public async loadByType(churchId: string, status: string) {
    const result = await sql<any>`
      SELECT eventLogs.*, personId
      FROM customers
      LEFT JOIN eventLogs ON customers.id = eventLogs.customerId
      WHERE eventLogs.status = ${status}
        AND eventLogs.churchId = ${churchId}
      ORDER BY eventLogs.created DESC`.execute(getDb());
    return result.rows;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("eventLogs").selectAll().where("churchId", "=", churchId).orderBy("created", "desc").execute();
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : null;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }

  private rowToModel(row: any): EventLog {
    return { ...row };
  }
}
