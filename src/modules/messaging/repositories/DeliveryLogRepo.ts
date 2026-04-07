import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { DeliveryLog } from "../models/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";

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

  public async loadByContent(contentType: string, contentId: string) {
    return getDb().selectFrom("deliveryLogs").selectAll()
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
