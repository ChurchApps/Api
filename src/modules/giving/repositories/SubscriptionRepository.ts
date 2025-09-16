import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Subscription } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class SubscriptionRepository extends ConfiguredRepository<Subscription> {
  protected get repoConfig(): RepoConfig<Subscription> {
    return {
      tableName: "subscriptions",
      hasSoftDelete: false,
      idColumn: "id", // External ID from payment provider
      columns: ["personId", "customerId"]
    };
  }

  // Override create to use external ID
  protected async create(model: Subscription): Promise<Subscription> {
    const sql = "INSERT INTO subscriptions (id, churchId, personId, customerId) VALUES (?, ?, ?, ?);";
    const params = [model.id, model.churchId, model.personId, model.customerId];
    await TypedDB.query(sql, params);
    return model;
  }

  // Override update for completeness (subscriptions rarely update)
  protected async update(model: Subscription): Promise<Subscription> {
    const sql = "UPDATE subscriptions SET personId=?, customerId=? WHERE id=? AND churchId=?";
    const params = [model.personId, model.customerId, model.id, model.churchId];
    await TypedDB.query(sql, params);
    return model;
  }

  // Override save to only create (subscriptions are typically immutable)
  public async save(subscription: Subscription) {
    return this.create(subscription);
  }

  public async loadByCustomerId(churchId: string, customerId: string) {
    return TypedDB.queryOne("SELECT * FROM subscriptions WHERE customerId=? AND churchId=?;", [customerId, churchId]);
  }

  protected rowToModel(row: any): Subscription {
    return { id: row.id, churchId: row.churchId, personId: row.personId, customerId: row.customerId };
  }
}
