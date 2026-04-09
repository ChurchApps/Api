import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { BlockoutDate } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class BlockoutDateRepo {
  public async save(model: BlockoutDate) {
    // Convert date-only fields before saving
    const processedData = { ...model };
    if (processedData.startDate) {
      (processedData as any).startDate = DateHelper.toMysqlDateOnly(processedData.startDate);
    }
    if (processedData.endDate) {
      (processedData as any).endDate = DateHelper.toMysqlDateOnly(processedData.endDate);
    }
    return processedData.id ? this.update(processedData) : this.create(processedData);
  }

  private async create(model: BlockoutDate): Promise<BlockoutDate> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("blockoutDates").values({ id: model.id, churchId: model.churchId, personId: model.personId, startDate: model.startDate as any, endDate: model.endDate as any }).execute();
    return model;
  }

  private async update(model: BlockoutDate): Promise<BlockoutDate> {
    await getDb().updateTable("blockoutDates").set({ personId: model.personId, startDate: model.startDate as any, endDate: model.endDate as any }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("blockoutDates").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("blockoutDates").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("blockoutDates").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return [];
    return getDb().selectFrom("blockoutDates").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute();
  }

  public async loadForPerson(churchId: string, personId: string) {
    return getDb().selectFrom("blockoutDates").selectAll().where("churchId", "=", churchId).where("personId", "=", personId).execute();
  }

  public async loadUpcoming(churchId: string) {
    return getDb().selectFrom("blockoutDates").selectAll().where("churchId", "=", churchId).where("endDate", ">", sql`NOW()` as any).execute();
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return (data || []).map(row => this.rowToModel(row));
  }

  protected rowToModel(row: any): BlockoutDate {
    return {
      id: row.id,
      churchId: row.churchId,
      personId: row.personId,
      startDate: row.startDate,
      endDate: row.endDate
    };
  }
}
