import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { Subscription, SubscriptionFund } from "../models/index.js";
import { SubscriptionFundsRepo } from "./SubscriptionFundsRepo.js";
import { WebhookDispatcher } from "../../../shared/webhooks/index.js";

@injectable()
export class SubscriptionRepo {

  // Subscriptions are typically immutable - save always creates, so subscription.created fires once
  // per new subscription. Changes to an existing one go to the gateway, never through here.
  public async save(subscription: Subscription, subscriptionFunds?: SubscriptionFund[]) {
    const saved = await this.create(subscription);
    // Fund rows are written before the emit, as with donation.created, so trigger conditions see them.
    if (subscriptionFunds?.length) {
      const fundsRepo = new SubscriptionFundsRepo();
      for (const sf of subscriptionFunds) {
        sf.churchId = saved.churchId;
        sf.subscriptionId = saved.id;
        await fundsRepo.save(sf);
      }
    }
    await WebhookDispatcher.emit(saved.churchId, "subscription.created", { ...saved, subscriptionFunds: subscriptionFunds || [] });
    return saved;
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

  private rowToModel(row: Subscription): Subscription {
    return { id: row.id, churchId: row.churchId, personId: row.personId, customerId: row.customerId, currency: row.currency };
  }
}
