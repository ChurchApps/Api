import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { Subscription } from "../models/index.js";

@injectable()
export class SubscriptionRepo {

  // Subscriptions are typically immutable - save always creates
  public async save(subscription: Subscription) {
    return this.create(subscription);
  }

  // External ID from payment provider, don't auto-generate
  private async create(model: Subscription): Promise<Subscription> {
    await getDb().insertInto("subscriptions").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      customerId: model.customerId,
      currency: model.currency
    }).execute();
    return model;
  }

  private async update(model: Subscription): Promise<Subscription> {
    await getDb().updateTable("subscriptions").set({
      personId: model.personId,
      customerId: model.customerId,
      currency: model.currency
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("subscriptions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("subscriptions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("subscriptions").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadByCustomerId(churchId: string, customerId: string) {
    return (await getDb().selectFrom("subscriptions").selectAll()
      .where("customerId", "=", customerId)
      .where("churchId", "=", churchId)
      .executeTakeFirst()) ?? null;
  }

  private rowToModel(row: any): Subscription {
    return { id: row.id, churchId: row.churchId, personId: row.personId, customerId: row.customerId, currency: row.currency };
  }
}
