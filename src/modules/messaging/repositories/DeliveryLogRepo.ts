import { injectable } from "inversify";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { deliveryLogs } from "../../../db/schema/messaging.js";

@injectable()
export class DeliveryLogRepo extends DrizzleRepo<typeof deliveryLogs> {
  protected readonly table = deliveryLogs;
  protected readonly moduleName = "messaging";

  public async save(model: any) {
    if (model.id) {
      await this.db.update(deliveryLogs).set(model)
        .where(and(eq(deliveryLogs.id, model.id), eq(deliveryLogs.churchId, model.churchId)));
    } else {
      model.id = UniqueIdHelper.shortId();
      model.attemptTime = new Date();
      await this.db.insert(deliveryLogs).values(model);
    }
    return model;
  }

  public async loadById(churchId: string, id: string) {
    return this.db.select().from(deliveryLogs)
      .where(and(eq(deliveryLogs.id, id), eq(deliveryLogs.churchId, churchId)))
      .then(r => r[0] ?? null);
  }

  public async loadByContent(contentType: string, contentId: string) {
    const result = await this.db.select().from(deliveryLogs)
      .where(and(eq(deliveryLogs.contentType, contentType), eq(deliveryLogs.contentId, contentId)))
      .orderBy(desc(deliveryLogs.attemptTime));
    return result || [];
  }

  public async loadByPerson(churchId: string, personId: string, startDate?: Date, endDate?: Date) {
    const conditions = [eq(deliveryLogs.churchId, churchId), eq(deliveryLogs.personId, personId)];
    if (startDate) conditions.push(gte(deliveryLogs.attemptTime, startDate));
    if (endDate) conditions.push(lte(deliveryLogs.attemptTime, endDate));
    const result = await this.db.select().from(deliveryLogs)
      .where(and(...conditions))
      .orderBy(desc(deliveryLogs.attemptTime));
    return result || [];
  }

  public async loadRecent(churchId: string, limit: number = 100) {
    const result = await this.db.select().from(deliveryLogs)
      .where(eq(deliveryLogs.churchId, churchId))
      .orderBy(desc(deliveryLogs.attemptTime))
      .limit(limit);
    return result || [];
  }

  public async delete(churchId: string, id: string) {
    await this.db.delete(deliveryLogs)
      .where(and(eq(deliveryLogs.id, id), eq(deliveryLogs.churchId, churchId)));
  }
}
