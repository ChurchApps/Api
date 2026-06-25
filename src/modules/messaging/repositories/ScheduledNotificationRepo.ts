import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { ScheduledNotification } from "../models/index.js";

@injectable()
export class ScheduledNotificationRepo {
  public async save(model: ScheduledNotification): Promise<ScheduledNotification> {
    model.id = UniqueIdHelper.shortId();
    // Store the absolute instant as a UTC wall-clock string so loadDue can compare
    // against UTC_TIMESTAMP() regardless of DB/session/driver timezone.
    const scheduledUtc = new Date(model.scheduledTime as any).toISOString().slice(0, 19).replace("T", " ");
    await getDb().insertInto("scheduledNotifications").values({
      id: model.id,
      churchId: model.churchId,
      groupId: model.groupId,
      title: model.title,
      message: model.message,
      link: model.link,
      imageUrl: model.imageUrl,
      senderPersonId: model.senderPersonId,
      scheduledTime: scheduledUtc as any,
      status: "pending"
    }).execute();
    return model;
  }

  public async loadDue() {
    return getDb().selectFrom("scheduledNotifications").selectAll()
      .where("status", "=", "pending")
      .where("scheduledTime", "<=", sql`UTC_TIMESTAMP()` as any)
      .limit(100)
      .execute();
  }

  // Atomic claim: only the runner that flips pending->sent proceeds to deliver,
  // so overlapping sweeps can't double-send.
  // ponytail: no retry on send failure — per-recipient failures still land in
  // deliveryLogs; add a 'failed' status + reclaim sweep if that's not enough.
  public async markSent(churchId: string, id: string): Promise<boolean> {
    const result = await getDb().updateTable("scheduledNotifications")
      .set({ status: "sent" })
      .where("id", "=", id).where("churchId", "=", churchId).where("status", "=", "pending")
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }
}
