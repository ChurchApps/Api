import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { EventException } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class EventExceptionRepo {
  public async save(model: EventException) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: EventException): Promise<EventException> {
    model.id = UniqueIdHelper.shortId();
    const exceptionDate = model.exceptionDate ? DateHelper.toMysqlDate(model.exceptionDate) : model.exceptionDate;
    await getDb().insertInto("eventExceptions").values({
      id: model.id,
      churchId: model.churchId,
      eventId: model.eventId,
      exceptionDate
    } as any).execute();
    return model;
  }

  private async update(model: EventException): Promise<EventException> {
    const exceptionDate = model.exceptionDate ? DateHelper.toMysqlDate(model.exceptionDate) : model.exceptionDate;
    await getDb().updateTable("eventExceptions").set({
      eventId: model.eventId,
      exceptionDate
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("eventExceptions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<EventException | undefined> {
    return (await getDb().selectFrom("eventExceptions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<EventException[]> {
    return getDb().selectFrom("eventExceptions").selectAll().where("churchId", "=", churchId).execute() as any;
  }

  public async loadForEvents(churchId: string, eventIds: string[]) {
    if (!eventIds || eventIds.length === 0) return [];
    return getDb().selectFrom("eventExceptions").selectAll()
      .where("churchId", "=", churchId)
      .where("eventId", "in", eventIds).execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as EventException; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as EventException[]; }

  protected rowToModel(row: any): EventException {
    return {
      id: row.id,
      churchId: row.churchId,
      eventId: row.eventId,
      exceptionDate: row.exceptionDate
    };
  }
}
