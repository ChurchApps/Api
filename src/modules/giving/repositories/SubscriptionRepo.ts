import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { subscriptions } from "../../../db/schema/giving.js";
import { Subscription } from "../models/index.js";

@injectable()
export class SubscriptionRepo extends DrizzleRepo<typeof subscriptions> {
  protected readonly table = subscriptions;
  protected readonly moduleName = "giving";

  // Subscriptions use external IDs and are typically immutable (create-only)
  public override async save(subscription: Subscription) {
    await this.db.insert(subscriptions).values(subscription as any);
    return subscription;
  }

  public async loadByCustomerId(churchId: string, customerId: string) {
    return this.db.select().from(subscriptions)
      .where(and(eq(subscriptions.customerId, customerId), eq(subscriptions.churchId, churchId)))
      .then(r => r[0] ?? null);
  }

  public convertToModel(_churchId: string, data: any): Subscription {
    return { id: data.id, churchId: data.churchId, personId: data.personId, customerId: data.customerId };
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
