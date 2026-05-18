import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Webhook } from "../models/index.js";

@injectable()
export class WebhookRepo {
  public async save(model: Webhook) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Webhook): Promise<Webhook> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("webhooks").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name,
      url: model.url,
      secret: model.secret,
      events: JSON.stringify(model.events ?? []),
      active: model.active === false ? 0 : 1,
      consecutiveFailures: 0,
      createdBy: model.createdBy,
      dateCreated: sql`NOW()` as any
    }).execute();
    return model;
  }

  private async update(model: Webhook): Promise<Webhook> {
    await getDb().updateTable("webhooks").set({
      name: model.name,
      url: model.url,
      secret: model.secret,
      events: JSON.stringify(model.events ?? []),
      active: model.active === false ? 0 : 1,
      dateModified: sql`NOW()` as any
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async load(churchId: string, id: string): Promise<Webhook> {
    const row = await getDb().selectFrom("webhooks").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst();
    return this.rowToModel(row);
  }

  public async loadAll(churchId: string): Promise<Webhook[]> {
    const rows = await getDb().selectFrom("webhooks").selectAll().where("churchId", "=", churchId).orderBy("dateCreated", "desc").execute();
    return rows.map((r) => this.rowToModel(r));
  }

  public async loadActiveByChurch(churchId: string): Promise<Webhook[]> {
    const rows = await getDb().selectFrom("webhooks").selectAll().where("churchId", "=", churchId).where("active", "=", 1).execute();
    return rows.map((r) => this.rowToModel(r));
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("webhooks").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async resetFailures(churchId: string, id: string) {
    await getDb().updateTable("webhooks").set({ consecutiveFailures: 0 }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  // Records an exhausted delivery; auto-disables the webhook once 3 deliveries in a row exhaust.
  public async recordExhaustion(churchId: string, id: string) {
    await getDb().updateTable("webhooks").set({
      consecutiveFailures: sql`consecutiveFailures + 1` as any,
      active: sql`IF(consecutiveFailures + 1 >= 3, 0, active)` as any
    }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  private rowToModel(row: any): Webhook {
    if (!row) return null;
    let events: string[] = [];
    try { events = JSON.parse(row.events ?? "[]"); } catch { events = []; }
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      url: row.url,
      secret: row.secret,
      events,
      active: row.active === 1 || row.active === true,
      consecutiveFailures: row.consecutiveFailures,
      createdBy: row.createdBy,
      dateCreated: row.dateCreated,
      dateModified: row.dateModified
    };
  }

  public convertToModel(_churchId: string, data: any) { return this.rowToModel(data); }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []).map((d) => this.rowToModel(d)); }
}
