import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { DeliveryLog } from "../models/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";

// Mail whose wording the church controls; system notification emails aren't a spam vector.
const CHURCH_AUTHORED = ["email", "formFollowUp"];

@injectable()
export class DeliveryLogRepo {
  public async save(model: DeliveryLog) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: DeliveryLog): Promise<DeliveryLog> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("deliveryLogs").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      contentType: model.contentType,
      contentId: model.contentId,
      deliveryMethod: model.deliveryMethod,
      success: model.success,
      errorMessage: model.errorMessage,
      deliveryAddress: model.deliveryAddress,
      attemptTime: sql`NOW()`
    }).execute();
    return model;
  }

  private async update(model: DeliveryLog): Promise<DeliveryLog> {
    await getDb().updateTable("deliveryLogs").set({
      success: model.success,
      errorMessage: model.errorMessage
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadById(churchId: string, id: string) {
    return (await getDb().selectFrom("deliveryLogs").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByContent(churchId: string, contentType: string, contentId: string) {
    return getDb().selectFrom("deliveryLogs").selectAll()
      .where("churchId", "=", churchId)
      .where("contentType", "=", contentType)
      .where("contentId", "=", contentId)
      .orderBy("attemptTime", "desc")
      .execute();
  }

  public async loadByPerson(churchId: string, personId: string, startDate?: Date, endDate?: Date) {
    let query = getDb().selectFrom("deliveryLogs").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId);
    if (startDate) {
      query = query.where("attemptTime", ">=", DateHelper.toMysqlDate(startDate) as any);
    }
    if (endDate) {
      query = query.where("attemptTime", "<=", DateHelper.toMysqlDate(endDate) as any);
    }
    return query.orderBy("attemptTime", "desc").execute();
  }

  public async loadRecent(churchId: string, limit: number = 100) {
    return getDb().selectFrom("deliveryLogs").selectAll()
      .where("churchId", "=", churchId)
      .orderBy("attemptTime", "desc")
      .limit(limit)
      .execute();
  }

  public async countChurchEmailsSince(churchId: string, since: Date): Promise<number> {
    const row = await getDb().selectFrom("deliveryLogs")
      .select((eb) => eb.fn.countAll<number>().as("cnt"))
      .where("churchId", "=", churchId)
      .where("deliveryMethod", "=", "email")
      .where("contentType", "in", CHURCH_AUTHORED)
      .where("attemptTime", ">=", DateHelper.toMysqlDate(since) as any)
      .executeTakeFirst();
    return Number(row?.cnt ?? 0);
  }

  public async countChurchEmailsByChurchSince(since: Date): Promise<{ churchId: string; cnt: number }[]> {
    const rows = await getDb().selectFrom("deliveryLogs")
      .select(["churchId", (eb) => eb.fn.countAll<number>().as("cnt")])
      .where("deliveryMethod", "=", "email")
      .where("contentType", "in", CHURCH_AUTHORED)
      .where("attemptTime", ">=", DateHelper.toMysqlDate(since) as any)
      .groupBy("churchId")
      .execute();
    return rows.map((r) => ({ churchId: r.churchId, cnt: Number(r.cnt) }));
  }

  public async bestChurchEmailDay(churchId: string, from: Date, to: Date): Promise<number> {
    const result = await sql<{ best: number }>`SELECT MAX(n) AS best FROM (SELECT COUNT(*) AS n FROM deliveryLogs WHERE churchId=${churchId} AND deliveryMethod='email' AND contentType IN (${sql.join(CHURCH_AUTHORED)}) AND attemptTime >= ${DateHelper.toMysqlDate(from)} AND attemptTime < ${DateHelper.toMysqlDate(to)} GROUP BY DATE(attemptTime)) d`.execute(getDb());
    return Number(result.rows[0]?.best ?? 0);
  }

  public async countFeedbackSince(churchId: string, deliveryMethod: "sesBounce" | "sesComplaint", since: Date): Promise<number> {
    const row = await getDb().selectFrom("deliveryLogs")
      .select((eb) => eb.fn.countAll<number>().as("cnt"))
      .where("churchId", "=", churchId)
      .where("deliveryMethod", "=", deliveryMethod)
      .where("attemptTime", ">=", DateHelper.toMysqlDate(since) as any)
      .executeTakeFirst();
    return Number(row?.cnt ?? 0);
  }

  public async findChurchEmailByAddress(address: string, from: Date, to: Date) {
    return (await getDb().selectFrom("deliveryLogs").selectAll()
      .where("deliveryAddress", "=", address)
      .where("deliveryMethod", "=", "email")
      .where("contentType", "in", CHURCH_AUTHORED)
      .where("attemptTime", ">=", DateHelper.toMysqlDate(from) as any)
      .where("attemptTime", "<=", DateHelper.toMysqlDate(to) as any)
      .orderBy("attemptTime", "desc")
      .executeTakeFirst()) ?? null;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("deliveryLogs").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  protected rowToModel(data: any): DeliveryLog {
    return {
      id: data.id,
      churchId: data.churchId,
      personId: data.personId,
      contentType: data.contentType,
      contentId: data.contentId,
      deliveryMethod: data.deliveryMethod,
      success: data.success,
      errorMessage: data.errorMessage,
      deliveryAddress: data.deliveryAddress,
      attemptTime: data.attemptTime
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
