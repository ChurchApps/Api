import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { CalendarBlockout } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class CalendarBlockoutRepo {
  public async save(model: CalendarBlockout) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: CalendarBlockout): Promise<CalendarBlockout> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("calendarBlockouts").values({
      id: model.id,
      churchId: model.churchId,
      roomId: model.roomId,
      resourceId: model.resourceId,
      startTime: model.startTime ? DateHelper.toMysqlDate(model.startTime) : null,
      endTime: model.endTime ? DateHelper.toMysqlDate(model.endTime) : null,
      reason: model.reason
    } as any).execute();
    return model;
  }

  private async update(model: CalendarBlockout): Promise<CalendarBlockout> {
    await getDb().updateTable("calendarBlockouts").set({
      roomId: model.roomId,
      resourceId: model.resourceId,
      startTime: model.startTime ? DateHelper.toMysqlDate(model.startTime) : null,
      endTime: model.endTime ? DateHelper.toMysqlDate(model.endTime) : null,
      reason: model.reason
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("calendarBlockouts").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<CalendarBlockout | undefined> {
    return (await getDb().selectFrom("calendarBlockouts").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<CalendarBlockout[]> {
    return getDb().selectFrom("calendarBlockouts").selectAll().where("churchId", "=", churchId).orderBy("startTime").execute() as any;
  }

  // Blockouts relevant to a window: church-wide ones plus those for the given rooms/resources.
  public async loadOverlapping(churchId: string, windowStart: Date, windowEnd: Date): Promise<CalendarBlockout[]> {
    return getDb().selectFrom("calendarBlockouts").selectAll()
      .where("churchId", "=", churchId)
      .where("startTime", "<", DateHelper.toMysqlDate(windowEnd) as any)
      .where("endTime", ">", DateHelper.toMysqlDate(windowStart) as any)
      .execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as CalendarBlockout; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as CalendarBlockout[]; }
}
