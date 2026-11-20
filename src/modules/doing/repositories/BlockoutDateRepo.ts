import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { BlockoutDate } from "../models/index.js";
import { getDb } from "../db/index.js";
import { mysqlValue } from "./sqlValues.js";

// Before saving, startDate/endDate become MySQL date-only strings.
type BlockoutDateRow = Omit<BlockoutDate, "startDate" | "endDate"> & { startDate?: Date | string; endDate?: Date | string };

@injectable()
export class BlockoutDateRepo {
  public async save(model: BlockoutDate): Promise<BlockoutDate> {
    // Convert date-only fields before saving
    const processedData: BlockoutDateRow = { ...model };
    if (processedData.startDate) {
      processedData.startDate = DateHelper.toMysqlDateOnly(processedData.startDate);
    }
    if (processedData.endDate) {
      processedData.endDate = DateHelper.toMysqlDateOnly(processedData.endDate);
    }
    return processedData.id ? this.update(processedData) : this.create(processedData);
  }

  private static dateValue(value: Date | string) {
    return typeof value === "string" ? mysqlValue<Date>(value) : value;
  }

  // The returned model carries the "YYYY-MM-DD" strings that were saved, as it always has.
  private async create(model: BlockoutDateRow): Promise<BlockoutDate> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("blockoutDates").values({ id: model.id, churchId: model.churchId, personId: model.personId, startDate: BlockoutDateRepo.dateValue(model.startDate), endDate: BlockoutDateRepo.dateValue(model.endDate) }).execute();
    return model as BlockoutDate;
  }

  private async update(model: BlockoutDateRow): Promise<BlockoutDate> {
    await getDb().updateTable("blockoutDates").set({ personId: model.personId, startDate: BlockoutDateRepo.dateValue(model.startDate), endDate: BlockoutDateRepo.dateValue(model.endDate) }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model as BlockoutDate;
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
    return getDb().selectFrom("blockoutDates").selectAll().where("churchId", "=", churchId).where("endDate", ">", sql<Date>`NOW()`).execute();
  }

  public convertToModel(_churchId: string, data: BlockoutDate) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: BlockoutDate[]) {
    return (data || []).map(row => this.rowToModel(row));
  }

  protected rowToModel(row: BlockoutDate): BlockoutDate {
    return {
      id: row.id,
      churchId: row.churchId,
      personId: row.personId,
      startDate: row.startDate,
      endDate: row.endDate
    };
  }
}
