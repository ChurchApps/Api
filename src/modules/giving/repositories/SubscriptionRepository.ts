import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { CollectionHelper } from "../../../shared/helpers";
import { Subscription } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class SubscriptionRepository extends ConfiguredRepository<Subscription> {
  protected get repoConfig(): RepoConfig<Subscription> {
    return {
      tableName: "subscriptions",
      hasSoftDelete: false,
      idColumn: "id", // External ID from payment provider
      insertColumns: ["personId", "customerId"],
      updateColumns: ["personId", "customerId"]
    };
  }

  // Override create to use external ID
  protected async create(model: Subscription): Promise<Subscription> {
    const sql = "INSERT INTO subscriptions (id, churchId, personId, customerId) VALUES (?, ?, ?, ?);";
    const params = [model.id, model.churchId, model.personId, model.customerId];
    await DB.query(sql, params);
    return model;
  }

  // Override update for completeness (subscriptions rarely update)
  protected async update(model: Subscription): Promise<Subscription> {
    const sql = "UPDATE subscriptions SET personId=?, customerId=? WHERE id=? AND churchId=?";
    const params = [model.personId, model.customerId, model.id, model.churchId];
    await DB.query(sql, params);
    return model;
  }

  // Override save to only create (subscriptions are typically immutable)
  public async save(subscription: Subscription) {
    return this.create(subscription);
  }

  public async loadByCustomerId(churchId: string, customerId: string) {
    return DB.queryOne("SELECT * FROM subscriptions WHERE customerId=? AND churchId=?;", [customerId, churchId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: Subscription = { id: data.id, churchId, personId: data.personId, customerId: data.customerId };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<Subscription>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
