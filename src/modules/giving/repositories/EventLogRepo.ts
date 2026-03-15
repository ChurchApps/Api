import { injectable } from "inversify";
import { eq, and, desc } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { eventLogs, customers } from "../../../db/schema/giving.js";
import { EventLog } from "../models/index.js";

@injectable()
export class EventLogRepo extends DrizzleRepo<typeof eventLogs> {
  protected readonly table = eventLogs;
  protected readonly moduleName = "giving";

  public async save(eventLog: EventLog): Promise<EventLog> {
    if (eventLog.providerId) {
      const existing = await this.loadByProviderId(eventLog.churchId as string, eventLog.providerId);
      if (existing) {
        const resolvedVal = eventLog.resolved ? 1 : 0;
        await this.db.update(eventLogs).set({ resolved: resolvedVal })
          .where(and(eq(eventLogs.id, existing.id!), eq(eventLogs.churchId, existing.churchId!)));
        eventLog.id = existing.id;
        return eventLog;
      }
    }
    return this.create(eventLog);
  }

  private async create(model: EventLog): Promise<EventLog> {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    const values = {
      id: model.id,
      churchId: model.churchId,
      customerId: model.customerId,
      provider: model.provider,
      providerId: model.providerId,
      eventType: model.eventType,
      message: model.message,
      status: model.status,
      created: model.created,
      resolved: 0
    };
    await this.db.insert(eventLogs).values(values as any);
    return model;
  }

  public async delete(churchId: string, id: string) {
    await this.db.delete(eventLogs).where(and(eq(eventLogs.id, id), eq(eventLogs.churchId, churchId)));
  }

  public load(churchId: string, id: string) {
    return this.db.select().from(eventLogs).where(and(eq(eventLogs.id, id), eq(eventLogs.churchId, churchId))).then(r => r[0] ?? null);
  }

  public loadAll(churchId: string) {
    return this.db.select().from(eventLogs).where(eq(eventLogs.churchId, churchId));
  }

  public async loadByProviderId(churchId: string, providerId: string): Promise<any> {
    return this.db.select().from(eventLogs)
      .where(and(eq(eventLogs.churchId, churchId), eq(eventLogs.providerId, providerId)))
      .limit(1)
      .then(r => r[0] ?? null);
  }

  public async loadByType(churchId: string, status: string) {
    return this.db.select({
      id: eventLogs.id,
      churchId: eventLogs.churchId,
      customerId: eventLogs.customerId,
      provider: eventLogs.provider,
      providerId: eventLogs.providerId,
      status: eventLogs.status,
      eventType: eventLogs.eventType,
      message: eventLogs.message,
      created: eventLogs.created,
      resolved: eventLogs.resolved,
      personId: customers.personId
    })
      .from(customers)
      .leftJoin(eventLogs, eq(customers.id, eventLogs.customerId))
      .where(and(eq(eventLogs.status, status), eq(eventLogs.churchId, churchId)))
      .orderBy(desc(eventLogs.created));
  }
}
