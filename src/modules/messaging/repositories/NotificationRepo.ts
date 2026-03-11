import { injectable } from "inversify";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { notifications } from "../../../db/schema/messaging.js";

@injectable()
export class NotificationRepo extends DrizzleRepo<typeof notifications> {
  protected readonly table = notifications;
  protected readonly moduleName = "messaging";

  public async save(model: any) {
    if (model.id) {
      await this.db.update(notifications).set(model)
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
    return this.executeRows(sql`
      SELECT DISTINCT n.churchId, n.personId
      FROM notifications n
      INNER JOIN notificationPreferences np ON np.churchId = n.churchId AND np.personId = n.personId
      WHERE n.deliveryMethod = 'email' AND np.emailFrequency = ${frequency} AND n.timeSent > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      LIMIT 200
    `);
  }

  public async loadByPersonIdForEmail(churchId: string, personId: string, frequency: string) {
    const timeCutoff = frequency === "individual"
      ? sql`DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
      : sql`DATE_SUB(NOW(), INTERVAL 24 HOUR)`;
    return this.executeRows(sql`
      SELECT * FROM notifications
      WHERE churchId = ${churchId} AND personId = ${personId} AND deliveryMethod = 'email' AND timeSent >= ${timeCutoff}
      ORDER BY timeSent
    `);
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
        SELECT COUNT(*) FROM notifications WHERE churchId = ${churchId} AND personId = ${personId} AND isNew = 1
      ) AS notificationCount, (
        SELECT COUNT(*) FROM privateMessages WHERE churchId = ${churchId} AND notifyPersonId = ${personId}
      ) AS pmCount
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
