import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Notification } from "../models/index.js";

@injectable()
export class NotificationRepo {
  public async save(model: Notification) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Notification): Promise<Notification> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("notifications").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      contentType: model.contentType,
      contentId: model.contentId,
      message: model.message,
      link: model.link,
      deliveryMethod: model.deliveryMethod,
      triggeredByPersonId: model.triggeredByPersonId,
      timeSent: sql`NOW()`,
      isNew: true as any
    }).execute();
    return model;
  }

  private async update(model: Notification): Promise<Notification> {
    await getDb().updateTable("notifications").set({
      contentType: model.contentType,
      contentId: model.contentId,
      isNew: model.isNew,
      message: model.message,
      link: model.link,
      deliveryMethod: model.deliveryMethod,
      triggeredByPersonId: model.triggeredByPersonId
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadById(churchId: string, id: string) {
    return (await getDb().selectFrom("notifications").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByPersonId(churchId: string, personId: string) {
    return getDb().selectFrom("notifications").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .orderBy("timeSent", "desc")
      .execute();
  }

  public async loadForEmail(frequency: string) {
    return getDb().selectFrom("notifications as n")
      .innerJoin("notificationPreferences as np", (join) =>
        join.onRef("np.churchId", "=", "n.churchId").onRef("np.personId", "=", "n.personId"))
      .select(["n.churchId", "n.personId"])
      .distinct()
      .where("n.deliveryMethod", "=", "email")
      .where("np.emailFrequency", "=", frequency)
      .where("n.timeSent", ">", sql`DATE_SUB(NOW(), INTERVAL 24 HOUR)` as any)
      .limit(200)
      .execute();
  }

  public async loadByPersonIdForEmail(churchId: string, personId: string, frequency: string) {
    const timeCutoff = frequency === "individual"
      ? sql`DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
      : sql`DATE_SUB(NOW(), INTERVAL 24 HOUR)`;
    return getDb().selectFrom("notifications").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .where("deliveryMethod", "=", "email")
      .where("timeSent", ">=", timeCutoff as any)
      .orderBy("timeSent")
      .execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("notifications").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async markRead(churchId: string, personId: string) {
    await getDb().updateTable("notifications").set({
      isNew: false as any,
      deliveryMethod: "complete"
    }).where("churchId", "=", churchId).where("personId", "=", personId).execute();
  }

  public async markAllRead(churchId: string, personId: string) {
    await getDb().updateTable("notifications").set({
      isNew: false as any,
      deliveryMethod: "complete"
    }).where("churchId", "=", churchId).where("personId", "=", personId).execute();
  }

  public async loadForPerson(churchId: string, personId: string) {
    return getDb().selectFrom("notifications").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .orderBy("timeSent", "desc")
      .execute();
  }

  public async loadNewCounts(churchId: string, personId: string) {
    const result = await getDb().selectNoFrom((eb) => [
      eb.selectFrom("notifications")
        .select(sql<number>`COUNT(*)`.as("notificationCount"))
        .where("churchId", "=", churchId)
        .where("personId", "=", personId)
        .where("isNew", "=", true as any)
        .as("notificationCount"),
      eb.selectFrom("privateMessages")
        .select(sql<number>`COUNT(*)`.as("pmCount"))
        .where("churchId", "=", churchId)
        .where("notifyPersonId", "=", personId)
        .as("pmCount")
    ]).executeTakeFirst();
    return result || {};
  }

  public async loadUndelivered() {
    return getDb().selectFrom("notifications").selectAll()
      .where("isNew", "=", true as any)
      .where((eb) =>
        eb.or([
          eb("deliveryMethod", "is", null),
          eb("deliveryMethod", "=", ""),
          eb("deliveryMethod", "=", "push"),
          eb("deliveryMethod", "=", "socket"),
          eb("deliveryMethod", "=", "email")
        ]))
      .execute();
  }

  public async loadExistingUnread(churchId: string, contentType: string, contentId: string) {
    return getDb().selectFrom("notifications").selectAll()
      .where("churchId", "=", churchId)
      .where("contentType", "=", contentType)
      .where("contentId", "=", contentId)
      .where("isNew", "=", true as any)
      .execute();
  }

  public async loadPendingEscalation() {
    return getDb().selectFrom("notifications").selectAll()
      .where("isNew", "=", true as any)
      .where("deliveryMethod", "in", ["socket", "push"])
      .execute();
  }

  protected rowToModel(data: any): Notification {
    return {
      id: data.id,
      churchId: data.churchId,
      personId: data.personId,
      contentType: data.contentType,
      contentId: data.contentId,
      timeSent: data.timeSent,
      isNew: data.isNew,
      message: data.message,
      link: data.link,
      deliveryMethod: data.deliveryMethod,
      triggeredByPersonId: data.triggeredByPersonId
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
