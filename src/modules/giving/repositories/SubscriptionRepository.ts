import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { CollectionHelper } from "../../../shared/helpers";
import { Subscription } from "../models";

@injectable()
export class SubscriptionRepository {
  public async save(subscription: Subscription) {
    return this.create(subscription);
  }

  private async create(subscription: Subscription) {
    return DB.query("INSERT INTO subscriptions (id, churchId, personId, customerId) VALUES (?, ?, ?, ?);", [
      subscription.id,
      subscription.churchId,
      subscription.personId,
      subscription.customerId
    ]).then(() => {
      return subscription;
    });
  }

  public async delete(churchId: string, id: string) {
    DB.query("DELETE FROM subscriptions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM subscriptions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async loadByCustomerId(churchId: string, customerId: string) {
    return DB.queryOne("SELECT * FROM subscriptions WHERE customerId=? AND churchId=?;", [customerId, churchId]);
  }

  public async loadAll(churchId: string) {
    return DB.query("SELECT * FROM subscriptions WHERE churchId=?;", [churchId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: Subscription = { id: data.id, churchId, personId: data.personId, customerId: data.customerId };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<Subscription>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
