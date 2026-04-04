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
    const result = await sql<any>`
      SELECT DISTINCT n.churchId, n.personId
      FROM notifications n
      INNER JOIN notificationPreferences np on np.churchId=n.churchId and np.personId=n.personId
      WHERE n.deliveryMethod='email' AND np.emailFrequency=${frequency} AND n.timeSent>DATE_SUB(NOW(), INTERVAL 24 HOUR)
      LIMIT 200
    `.execute(getDb());
    return result.rows;
  }

  public async loadByPersonIdForEmail(churchId: string, personId: string, frequency: string) {
    const timeCutoff = frequency === "individual"
      ? sql`DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
      : sql`DATE_SUB(NOW(), INTERVAL 24 HOUR)`;
    const result = await sql<any>`
      SELECT * FROM notifications
      WHERE churchId=${churchId} AND personId=${personId} AND deliveryMethod='email' AND timeSent>=${timeCutoff}
      ORDER BY timeSent
    `.execute(getDb());
    return result.rows;
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
    const result = await sql<any>`
      SELECT (
        SELECT COUNT(*) FROM notifications where churchId=${churchId} and personId=${personId} and isNew=1
      ) AS notificationCount, (
        SELECT COUNT(*) FROM privateMessages where churchId=${churchId} and notifyPersonId=${personId}
      ) AS pmCount
    `.execute(getDb());
    return result.rows?.[0] || {};
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
        ])
      )
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
