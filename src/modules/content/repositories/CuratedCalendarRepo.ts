import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { CuratedCalendar } from "../models/index.js";

@injectable()
export class CuratedCalendarRepo {
  public async save(model: CuratedCalendar) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: CuratedCalendar): Promise<CuratedCalendar> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("curatedCalendars").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name
    } as any).execute();
    return model;
  }

  private async update(model: CuratedCalendar): Promise<CuratedCalendar> {
    await getDb().updateTable("curatedCalendars").set({ name: model.name }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("curatedCalendars").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<CuratedCalendar | undefined> {
    return (await getDb().selectFrom("curatedCalendars").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<CuratedCalendar[]> {
    return getDb().selectFrom("curatedCalendars").selectAll().where("churchId", "=", churchId).execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as CuratedCalendar; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as CuratedCalendar[]; }

  protected rowToModel(row: any): CuratedCalendar {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name
    };
  }
}
