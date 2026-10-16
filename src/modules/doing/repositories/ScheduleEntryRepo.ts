import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { ScheduleEntry } from "../models/index.js";
import { getDb } from "../db/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { PlaylistRepo } from "./PlaylistRepo.js";

@injectable()
export class ScheduleEntryRepo {
  public async save(model: ScheduleEntry) {
    return model.id ? this.update(model) : this.create(model);
  }

  private toRow(model: ScheduleEntry) {
    return {
      screenGroupId: model.screenGroupId,
      targetType: model.targetType,
      targetId: model.targetId || null,
      providerId: model.providerId || null,
      providerPath: model.providerPath || null,
      start: DateHelper.toMysqlDate(model.start),
      end: DateHelper.toMysqlDate(model.end),
      recurrenceRule: model.recurrenceRule || null,
      exceptionDates: model.exceptionDates?.length ? JSON.stringify(model.exceptionDates) : null,
      endBehavior: model.endBehavior || "loop",
      enabled: model.enabled !== false
    };
  }

  private async create(model: ScheduleEntry): Promise<ScheduleEntry> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("scheduleEntries").values({ id: model.id, churchId: model.churchId, ...this.toRow(model) }).execute();
    return model;
  }

  private async update(model: ScheduleEntry): Promise<ScheduleEntry> {
    await getDb().updateTable("scheduleEntries").set(this.toRow(model)).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("scheduleEntries").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteByScreenGroupId(churchId: string, screenGroupId: string) {
    await getDb().deleteFrom("scheduleEntries").where("churchId", "=", churchId).where("screenGroupId", "=", screenGroupId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("scheduleEntries").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("scheduleEntries").selectAll().where("churchId", "=", churchId).orderBy("start").execute();
  }

  public async loadByScreenGroupId(churchId: string, screenGroupId: string) {
    return getDb().selectFrom("scheduleEntries").selectAll().where("churchId", "=", churchId).where("screenGroupId", "=", screenGroupId).orderBy("start").execute();
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return (data || []).map(row => this.rowToModel(row));
  }

  private static toWallClock(value: Date | string) {
    return DateHelper.toMysqlDate(value)?.replace(" ", "T");
  }

  protected rowToModel(row: any): ScheduleEntry {
    return {
      id: row.id,
      churchId: row.churchId,
      screenGroupId: row.screenGroupId,
      targetType: row.targetType,
      targetId: row.targetId,
      providerId: row.providerId,
      providerPath: row.providerPath,
      start: ScheduleEntryRepo.toWallClock(row.start),
      end: ScheduleEntryRepo.toWallClock(row.end),
      recurrenceRule: row.recurrenceRule,
      exceptionDates: PlaylistRepo.parseJson(row.exceptionDates) || [],
      endBehavior: row.endBehavior,
      enabled: !!row.enabled
    };
  }
}
