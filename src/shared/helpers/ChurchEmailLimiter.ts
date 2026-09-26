import { RepoManager } from "../infrastructure/RepoManager.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY = 2000;
const STARTER_DAILY = 150;

export interface EmailReservation {
  address: string;
  personId?: string;
  contentId?: string;
}

export interface ChurchEmailStatus {
  approved: boolean;
  paused: boolean;
  remaining: number;
}

// Church-authored mail goes out from our SES identity. A server admin must approve a church before it sends any, since
// bots register churches faster than an automatic rule can vet them; after that the allowance grows with clean history.
export class ChurchEmailLimiter {
  static async status(churchId: string): Promise<ChurchEmailStatus> {
    const s = await this.check(churchId);
    return { ...s, remaining: Math.max(0, s.remaining) };
  }

  static async remaining(churchId: string): Promise<number> {
    return (await this.status(churchId)).remaining;
  }

  // Rows go in before the send and the allowance is re-checked with them counted, so concurrent
  // requests can't each pass a stale check; if the recheck overshoots, this request backs out.
  static async reserve(churchId: string, contentType: string, recipients: EmailReservation[]): Promise<string[] | null> {
    if (recipients.length === 0) return [];
    if (recipients.length > await this.remaining(churchId)) return null;
    const messaging = await RepoManager.getRepos<any>("messaging");
    const rows = await messaging.deliveryLog.createMany(recipients.map((r) => ({ churchId, personId: r.personId, contentType, contentId: r.contentId, deliveryMethod: "email", deliveryAddress: r.address, success: true })));
    const ids: string[] = rows.map((r: any) => r.id);
    if ((await this.check(churchId)).remaining < 0) {
      await messaging.deliveryLog.deleteIds(churchId, ids);
      return null;
    }
    return ids;
  }

  static async settle(churchId: string, id: string, success: boolean, errorMessage?: string) {
    const messaging = await RepoManager.getRepos<any>("messaging");
    await messaging.deliveryLog.markAttempt(churchId, id, success, errorMessage);
  }

  private static async check(churchId: string): Promise<ChurchEmailStatus> {
    const membership = await RepoManager.getRepos<any>("membership");
    const messaging = await RepoManager.getRepos<any>("messaging");
    const church = await membership.church.loadById(churchId);
    if (!church?.emailApprovedDate || church.archivedDate) return { approved: false, paused: false, remaining: 0 };
    if (await this.isPaused(messaging, churchId)) return { approved: true, paused: true, remaining: 0 };

    const dayAgo = new Date(Date.now() - DAY_MS);
    const sent: number = await messaging.deliveryLog.countChurchEmailsSince(churchId, dayAgo);
    // The current 24h is excluded so a burst can't bootstrap its own allowance.
    const best: number = await messaging.deliveryLog.bestChurchEmailDay(churchId, new Date(Date.now() - 31 * DAY_MS), dayAgo);
    const allowance = Math.min(MAX_DAILY, Math.max(STARTER_DAILY, best * 2));
    return { approved: true, paused: false, remaining: allowance - sent };
  }

  // SES review thresholds are 0.1% complaints / 5% bounces account-wide; pause a church well before it drags us there.
  private static async isPaused(messaging: any, churchId: string): Promise<boolean> {
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);
    const [complaints, bounces, sent] = await Promise.all([
      messaging.deliveryLog.countByMethodSince(churchId, "sesComplaint", weekAgo),
      messaging.deliveryLog.countByMethodSince(churchId, "sesBounce", weekAgo),
      messaging.deliveryLog.countChurchEmailsSince(churchId, weekAgo)
    ]);
    return (complaints >= 2 && complaints >= sent * 0.003) || (bounces >= 10 && bounces >= sent * 0.05);
  }
}
