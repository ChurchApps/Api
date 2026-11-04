import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { ScheduledNotification } from "../models/index.js";

const LEASE_MINUTES = 10; // a 'processing' row older than this is re-surfaced (crash recovery)
const RECENT_LIMIT = 25;
const FINISHED = ["sent", "failed", "cancelled"];

// Times are compared against a Node-formatted "now" so they match how sendAt is written.
const nowSql = () => DateHelper.toMysqlDate(new Date()) as any;
const leaseCutoff = () => DateHelper.toMysqlDate(new Date(Date.now() - LEASE_MINUTES * 60 * 1000)) as any;

@injectable()
export class ScheduledNotificationRepo {
  // Edits only apply while the row is still pending, so a send the timer already claimed is left alone.
  public async save(model: ScheduledNotification): Promise<ScheduledNotification> {
    const values = {
      audience: model.audience,
      groupId: model.groupId || null,
      title: model.title,
      message: model.message,
      link: model.link || null,
      imageUrl: model.imageUrl || null,
      sendAt: DateHelper.toMysqlDate(model.sendAt) as any,
      timeZone: model.timeZone || null,
      status: model.status || "pending"
    } as any;
    if (model.id) {
      await getDb().updateTable("scheduledNotifications").set({ ...values, dateModified: nowSql() })
        .where("id", "=", model.id).where("churchId", "=", model.churchId).where("status", "=", "pending").execute();
      return model;
    }
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("scheduledNotifications").values({
      ...values,
      id: model.id,
      churchId: model.churchId,
      attemptCount: 0,
      createdByPersonId: model.createdByPersonId || null,
      dateCreated: nowSql()
    }).execute();
    return model;
  }

  public async load(churchId: string, id: string) {
    return getDb().selectFrom("scheduledNotifications").selectAll()
      .where("churchId", "=", churchId).where("id", "=", id).executeTakeFirst();
  }

  // Everything still queued, plus the most recent finished rows for the history table.
  public async loadForChurch(churchId: string) {
    const upcoming = await getDb().selectFrom("scheduledNotifications").selectAll()
      .where("churchId", "=", churchId).where("status", "in", ["pending", "processing"])
      .orderBy("sendAt").execute();
    const recent = await getDb().selectFrom("scheduledNotifications").selectAll()
      .where("churchId", "=", churchId).where("status", "in", FINISHED)
      .orderBy("sendAt", "desc").limit(RECENT_LIMIT).execute();
    return [...upcoming, ...recent];
  }

  public async loadDue(limit = 100) {
    return getDb().selectFrom("scheduledNotifications").selectAll()
      .where((eb) => eb.or([
        eb.and([eb("status", "=", "pending"), eb("sendAt", "<=", nowSql())]),
        eb.and([eb("status", "=", "processing"), eb("claimedAt", "<", leaseCutoff())])
      ]))
      .orderBy("sendAt")
      .limit(limit)
      .execute();
  }

  // Atomic claim: only the worker that flips pending->processing proceeds.
  public async claim(id: string): Promise<boolean> {
    const result = await getDb().updateTable("scheduledNotifications")
      .set({ status: "processing", claimedAt: nowSql(), attemptCount: sql`attemptCount + 1` as any })
      .where("id", "=", id)
      .where((eb) => eb.or([
        eb("status", "=", "pending"),
        eb.and([eb("status", "=", "processing"), eb("claimedAt", "<", leaseCutoff())])
      ]))
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  public async markSent(id: string, recipientCount: number, successCount: number) {
    await getDb().updateTable("scheduledNotifications")
      .set({ status: "sent", sentAt: nowSql(), recipientCount, successCount, lastError: null as any }).where("id", "=", id).execute();
  }

  public async markRetry(id: string, lastError: string) {
    await getDb().updateTable("scheduledNotifications")
      .set({ status: "pending", lastError: lastError.substring(0, 500) }).where("id", "=", id).execute();
  }

  public async markFailed(id: string, lastError: string) {
    await getDb().updateTable("scheduledNotifications")
      .set({ status: "failed", lastError: lastError.substring(0, 500) }).where("id", "=", id).execute();
  }

  public async cancel(churchId: string, id: string): Promise<boolean> {
    const result = await getDb().updateTable("scheduledNotifications").set({ status: "cancelled", dateModified: nowSql() })
      .where("churchId", "=", churchId).where("id", "=", id).where("status", "=", "pending").executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  // Removing from the Recent list only ever touches finished rows; a pending row is cancelled instead.
  public async delete(churchId: string, id: string): Promise<boolean> {
    const result = await getDb().deleteFrom("scheduledNotifications")
      .where("churchId", "=", churchId).where("id", "=", id).where("status", "in", FINISHED).executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0) > 0;
  }

  public async deleteFinished(churchId: string, audiences: string[]): Promise<number> {
    if (audiences.length === 0) return 0;
    const result = await getDb().deleteFrom("scheduledNotifications")
      .where("churchId", "=", churchId).where("status", "in", FINISHED).where("audience", "in", audiences).executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0);
  }
}
