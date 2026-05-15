import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { WebhookDelivery } from "../models/index.js";

@injectable()
export class WebhookDeliveryRepo {
  public async create(model: WebhookDelivery): Promise<WebhookDelivery> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("webhookDeliveries").values({
      id: model.id,
      churchId: model.churchId,
      webhookId: model.webhookId,
      event: model.event,
      payload: model.payload,
      status: model.status ?? "pending",
      attemptCount: model.attemptCount ?? 0,
      responseStatus: model.responseStatus ?? null,
      responseBody: model.responseBody ?? null,
      nextAttemptAt: model.nextAttemptAt ?? (sql`NOW()` as any),
      dateCreated: sql`NOW()` as any
    }).execute();
    return model;
  }

  public async update(model: WebhookDelivery): Promise<WebhookDelivery> {
    await getDb().updateTable("webhookDeliveries").set({
      status: model.status,
      attemptCount: model.attemptCount,
      responseStatus: model.responseStatus ?? null,
      responseBody: model.responseBody ?? null,
      nextAttemptAt: model.nextAttemptAt ?? null,
      dateCompleted: model.dateCompleted ?? null
    }).where("id", "=", model.id).execute();
    return model;
  }

  public async load(churchId: string, id: string): Promise<WebhookDelivery> {
    return (await getDb().selectFrom("webhookDeliveries").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByWebhook(churchId: string, webhookId: string, limit = 50): Promise<WebhookDelivery[]> {
    return getDb().selectFrom("webhookDeliveries").selectAll()
      .where("churchId", "=", churchId)
      .where("webhookId", "=", webhookId)
      .orderBy("dateCreated", "desc")
      .limit(limit)
      .execute();
  }

  // Cross-church sweep used by the delivery worker — returns deliveries that are due for an attempt.
  public async loadDuePending(limit = 100): Promise<WebhookDelivery[]> {
    return getDb().selectFrom("webhookDeliveries").selectAll()
      .where("status", "in", ["pending", "failed"])
      .where("nextAttemptAt", "<=", sql`NOW()` as any)
      .orderBy("nextAttemptAt", "asc")
      .limit(limit)
      .execute();
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
