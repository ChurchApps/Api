import { injectable } from "inversify";
import { eq, and, sql, desc, inArray, gt } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { notifications, notificationPreferences, privateMessages } from "../../../db/schema/messaging.js";

@injectable()
export class NotificationRepo extends DrizzleRepo<typeof notifications> {
  protected readonly table = notifications;
  protected readonly moduleName = "messaging";

  public async save(model: any) {
    if (model.id) {
      const { id: _id, churchId: _cid, ...setData } = model;
      await this.db.update(notifications).set(setData)
        .where(and(eq(notifications.id, model.id), eq(notifications.churchId, model.churchId)));
    } else {
      model.id = UniqueIdHelper.shortId();
      model.timeSent = new Date();
      model.isNew = true;
      await this.db.insert(notifications).values(model);
    }
    return model;
  }

  public async loadById(churchId: string, id: string) {
    return this.db.select().from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.churchId, churchId)))
      .then(r => r[0] ?? null);
  }

  public async loadByPersonId(churchId: string, personId: string) {
    const result = await this.db.select().from(notifications)
      .where(and(eq(notifications.churchId, churchId), eq(notifications.personId, personId)))
      .orderBy(desc(notifications.timeSent));
    return result || [];
  }

  public async loadForEmail(frequency: string) {
    return this.db.selectDistinct({
      churchId: notifications.churchId,
      personId: notifications.personId
    })
      .from(notifications)
      .innerJoin(notificationPreferences, and(
        eq(notificationPreferences.churchId, notifications.churchId),
        eq(notificationPreferences.personId, notifications.personId)
      ))
      .where(and(
        eq(notifications.deliveryMethod, "email"),
        eq(notificationPreferences.emailFrequency, frequency),
        gt(notifications.timeSent, DateHelper.hoursFromNow(-24))
      ))
      .limit(200);
  }

  public async loadByPersonIdForEmail(churchId: string, personId: string, frequency: string) {
    const cutoff = frequency === "individual"
      ? DateHelper.hoursFromNow(-0.5)  // 30 minutes ago
      : DateHelper.hoursFromNow(-24);

    return this.db.select().from(notifications)
      .where(and(
        eq(notifications.churchId, churchId),
        eq(notifications.personId, personId),
        eq(notifications.deliveryMethod, "email"),
        gt(notifications.timeSent, cutoff)
      ))
      .orderBy(notifications.timeSent);
  }

  public async delete(churchId: string, id: string) {
    await this.db.delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.churchId, churchId)));
  }

  public async markRead(churchId: string, personId: string) {
    await this.db.update(notifications)
      .set({ isNew: false, deliveryMethod: "complete" })
      .where(and(eq(notifications.churchId, churchId), eq(notifications.personId, personId)));
  }

  public async markAllRead(churchId: string, personId: string) {
    await this.db.update(notifications)
      .set({ isNew: false, deliveryMethod: "complete" })
      .where(and(eq(notifications.churchId, churchId), eq(notifications.personId, personId)));
  }

  public async loadForPerson(churchId: string, personId: string) {
    const result = await this.db.select().from(notifications)
      .where(and(eq(notifications.churchId, churchId), eq(notifications.personId, personId)))
      .orderBy(desc(notifications.timeSent));
    return result || [];
  }

  public async loadNewCounts(churchId: string, personId: string) {
    const rows = await this.executeRows(sql`
      SELECT (
        SELECT COUNT(*) FROM ${notifications} WHERE ${notifications.churchId} = ${churchId} AND ${notifications.personId} = ${personId} AND ${notifications.isNew} = ${true}
      ) AS "notificationCount", (
        SELECT COUNT(*) FROM ${privateMessages} WHERE ${privateMessages.churchId} = ${churchId} AND ${privateMessages.notifyPersonId} = ${personId}
      ) AS "pmCount"
    `);
    return rows[0] ?? {};
  }

  public async loadUndelivered() {
    const result = await this.db.select().from(notifications)
      .where(and(
        eq(notifications.isNew, true),
        sql`(${notifications.deliveryMethod} IS NULL OR ${notifications.deliveryMethod} = '' OR ${notifications.deliveryMethod} = 'push' OR ${notifications.deliveryMethod} = 'socket' OR ${notifications.deliveryMethod} = 'email')`
      ));
    return result || [];
  }

  public async loadExistingUnread(churchId: string, contentType: string, contentId: string) {
    const result = await this.db.select().from(notifications)
      .where(and(
        eq(notifications.churchId, churchId),
        eq(notifications.contentType, contentType),
        eq(notifications.contentId, contentId),
        eq(notifications.isNew, true)
      ));
    return result || [];
  }

  public async loadPendingEscalation() {
    const result = await this.db.select().from(notifications)
      .where(and(
        eq(notifications.isNew, true),
        inArray(notifications.deliveryMethod, ["socket", "push"])
      ));
    return result || [];
  }
}
