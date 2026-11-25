import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { DeliveryLog } from "../models/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { mysqlDate } from "./MysqlDate.js";

// Mail whose wording the church writes. Role and group invites are a fixed template and are not counted.
const CHURCH_AUTHORED = ["email", "formFollowUp", "workflowEmail"];

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

  public async createMany(models: DeliveryLog[]): Promise<DeliveryLog[]> {
    if (models.length === 0) return models;
    models.forEach((m) => { m.id = UniqueIdHelper.shortId(); });
    await getDb().insertInto("deliveryLogs").values(models.map((m) => ({
      id: m.id,
      churchId: m.churchId,
      personId: m.personId,
      contentType: m.contentType,
      contentId: m.contentId,
      deliveryMethod: m.deliveryMethod,
      success: m.success,
      errorMessage: m.errorMessage,
      deliveryAddress: m.deliveryAddress,
      attemptTime: sql`NOW()`
    }))).execute();
    return models;
  }

  // Reserved rows are inserted before the send; stamping the real attempt time keeps SES feedback matching accurate.
  public async markAttempt(churchId: string, id: string, success: boolean, errorMessage?: string) {
    await getDb().updateTable("deliveryLogs").set({ success, errorMessage: errorMessage?.slice(0, 500), attemptTime: sql`NOW()` })
      .where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return;
    await getDb().deleteFrom("deliveryLogs").where("churchId", "=", churchId).where("id", "in", ids).execute();
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
      query = query.where("attemptTime", ">=", mysqlDate(startDate));
    }
    if (endDate) {
      query = query.where("attemptTime", "<=", mysqlDate(endDate));
    }
    return query.orderBy("attemptTime", "desc").execute();
  }

  // Rows carry the personId they were sent to, so failures match by person, not by the address on file today.
  public async loadFailuresByPerson(churchId: string, personId: string, limit: number) {
    return getDb().selectFrom("deliveryLogs")
      .select(["attemptTime", "deliveryMethod", "deliveryAddress", "errorMessage"])
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .where("success", "=", false)
      .orderBy("attemptTime", "desc")
      .limit(limit)
      .execute();
  }

  public async loadLatestEmailEvent(churchId: string, personId: string) {
    return (await getDb().selectFrom("deliveryLogs").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .where("deliveryMethod", "in", ["email", "sesBounce"])
      .orderBy("attemptTime", "desc")
      .limit(1)
      .executeTakeFirst()) ?? null;
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
      .where("attemptTime", ">=", mysqlDate(since))
      .executeTakeFirst();
    return Number(row?.cnt ?? 0);
  }

  // Days whose bounces/complaints exceed 2% of sends don't count, so a dirty list can't grow the allowance.
  public async bestChurchEmailDay(churchId: string, from: Date, to: Date): Promise<number> {
    const result = await sql<{ best: number }>`SELECT MAX(sent) AS best FROM (SELECT SUM(deliveryMethod='email' AND success=1) AS sent, SUM(deliveryMethod IN ('sesBounce','sesComplaint')) AS feedback FROM deliveryLogs WHERE churchId=${churchId} AND contentType IN (${sql.join(CHURCH_AUTHORED)}) AND deliveryMethod IN ('email','sesBounce','sesComplaint') AND attemptTime >= ${DateHelper.toMysqlDate(from)} AND attemptTime < ${DateHelper.toMysqlDate(to)} GROUP BY DATE(attemptTime) HAVING feedback <= sent * 0.02) d`.execute(getDb());
    return Number(result.rows[0]?.best ?? 0);
  }

  public async countByMethodSince(churchId: string, deliveryMethod: string, since: Date): Promise<number> {
    const row = await getDb().selectFrom("deliveryLogs")
      .select((eb) => eb.fn.countAll<number>().as("cnt"))
      .where("churchId", "=", churchId)
      .where("deliveryMethod", "=", deliveryMethod)
      .where("attemptTime", ">=", mysqlDate(since))
      .executeTakeFirst();
    return Number(row?.cnt ?? 0);
  }

  public async findChurchEmailByAddress(address: string, from: Date, to: Date) {
    return (await getDb().selectFrom("deliveryLogs").selectAll()
      .where("deliveryAddress", "=", address)
      .where("deliveryMethod", "=", "email")
      .where("contentType", "in", CHURCH_AUTHORED)
      .where("attemptTime", ">=", mysqlDate(from))
      .where("attemptTime", "<=", mysqlDate(to))
      .orderBy("attemptTime", "desc")
      .executeTakeFirst()) ?? null;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("deliveryLogs").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  protected rowToModel(data: DeliveryLog): DeliveryLog {
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

  public convertToModel(data: DeliveryLog) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: DeliveryLog[]) {
    return data.map((d) => this.rowToModel(d));
  }
}
