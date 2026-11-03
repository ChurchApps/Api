import { ScheduledNotification } from "../models/index.js";
import { NotificationHelper } from "./NotificationHelper.js";
import { PushAudienceHelper } from "./PushAudienceHelper.js";

const MAX_ATTEMPTS = 3;
// A "starts in 15 minutes" push that lands an hour late does more harm than good.
const MISSED_WINDOW_MS = 30 * 60 * 1000;

export interface ScheduledSendResult {
  recipientCount: number;
  successCount: number;
}

// Scheduled push notifications (ChurchAppsSupport#1411), sent by the one-minute timer.
export class ScheduledNotificationHelper {
  static async send(repos: any, row: ScheduledNotification): Promise<ScheduledSendResult> {
    const isChurch = row.audience === "church";
    const preview = isChurch
      ? await PushAudienceHelper.getChurchPushPreview(repos, row.churchId, row.createdByPersonId)
      : await PushAudienceHelper.getGroupPushPreview(repos, row.churchId, row.groupId, row.createdByPersonId);
    if (preview.eligiblePersonIds.length === 0) return { recipientCount: 0, successCount: 0 };

    const link = row.link || (isChurch ? "/mobile" : `/mobile/groups/${row.groupId}`);
    const notifications = await NotificationHelper.createNotifications(
      preview.eligiblePersonIds,
      row.churchId,
      isChurch ? "churchPushNotification" : "groupPushNotification",
      row.id,
      row.message,
      link,
      row.createdByPersonId,
      {
        deliveryStartLevel: 1,
        deliveryTitle: row.title,
        navData: {
          innerType: isChurch ? "church" : "group",
          innerId: isChurch ? row.churchId : row.groupId,
          link,
          ...(row.imageUrl ? { image: row.imageUrl } : {})
        }
      }
    );
    const successCount = notifications.filter((n: any) => n.deliveryMethod === "push").length;
    return { recipientCount: preview.eligiblePersonIds.length, successCount };
  }

  static async dispatchDue(repos: any, now: Date = new Date()) {
    const due: ScheduledNotification[] = (await repos.scheduledNotification.loadDue()) as any[];
    let sent = 0;
    let failed = 0;
    for (const row of due) {
      if (!(await repos.scheduledNotification.claim(row.id))) continue;
      const attempt = (row.attemptCount || 0) + 1;
      if (attempt === 1 && now.getTime() - new Date(row.sendAt).getTime() > MISSED_WINDOW_MS) {
        await repos.scheduledNotification.markFailed(row.id, "missed send window");
        failed++;
        continue;
      }
      try {
        const result = await this.send(repos, row);
        await repos.scheduledNotification.markSent(row.id, result.recipientCount, result.successCount);
        sent++;
      } catch (e: any) {
        const error = e?.message || String(e);
        if (attempt >= MAX_ATTEMPTS) {
          await repos.scheduledNotification.markFailed(row.id, error);
          failed++;
        } else await repos.scheduledNotification.markRetry(row.id, error);
      }
    }
    return { due: due.length, sent, failed };
  }

  // "Send now" from the list page: claim so a concurrent timer run can't double-send.
  static async sendNow(repos: any, row: ScheduledNotification): Promise<ScheduledSendResult | null> {
    if (!(await repos.scheduledNotification.claim(row.id))) return null;
    try {
      const result = await this.send(repos, row);
      await repos.scheduledNotification.markSent(row.id, result.recipientCount, result.successCount);
      return result;
    } catch (e: any) {
      await repos.scheduledNotification.markRetry(row.id, e?.message || String(e));
      throw e;
    }
  }
}
