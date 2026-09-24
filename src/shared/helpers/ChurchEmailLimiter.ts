import { RepoManager } from "../infrastructure/RepoManager.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY = 2000;
const STARTER_DAILY = 150;
const LOW_TRUST_POOL_DAILY = 300;

// Church-authored mail goes out from our SES identity, so allowance is earned by sending history, not church age:
// a dormant bot-farm church is as untrusted on day 400 as on day 1. Every low-trust church shares one pool.
export class ChurchEmailLimiter {
  static async remaining(churchId: string): Promise<number> {
    const membership = await RepoManager.getRepos<any>("membership");
    const messaging = await RepoManager.getRepos<any>("messaging");
    const church = await membership.church.loadById(churchId);
    if (!church || church.archivedDate) return 0;
    if (await this.isPaused(messaging, churchId)) return 0;

    const dayAgo = new Date(Date.now() - DAY_MS);
    const sent: number = await messaging.deliveryLog.countChurchEmailsSince(churchId, dayAgo);
    const earned = await this.earned(messaging, churchId);
    if (earned >= STARTER_DAILY) return Math.max(0, Math.min(MAX_DAILY, earned) - sent);

    let poolSent = sent;
    const today: { churchId: string; cnt: number }[] = await messaging.deliveryLog.countChurchEmailsByChurchSince(dayAgo);
    for (const other of today) {
      if (other.churchId === churchId || (await this.earned(messaging, other.churchId)) >= STARTER_DAILY) continue;
      // An archived abuser's burst shouldn't lock out every other new sender for the rest of the day.
      if ((await membership.church.loadById(other.churchId))?.archivedDate) continue;
      poolSent += other.cnt;
    }
    return Math.max(0, Math.min(STARTER_DAILY - sent, LOW_TRUST_POOL_DAILY - poolSent));
  }

  static async record(churchId: string, contentType: string, address: string, personId?: string) {
    const messaging = await RepoManager.getRepos<any>("messaging");
    await messaging.deliveryLog.save({ churchId, personId, contentType, deliveryMethod: "email", deliveryAddress: address, success: true });
  }

  // Twice the church's busiest day over the prior 30 days, excluding the current 24h so a burst can't bootstrap itself.
  private static async earned(messaging: any, churchId: string): Promise<number> {
    const dayAgo = new Date(Date.now() - DAY_MS);
    const best: number = await messaging.deliveryLog.bestChurchEmailDay(churchId, new Date(Date.now() - 31 * DAY_MS), dayAgo);
    return best * 2;
  }

  // SES review thresholds are 0.1% complaints / 5% bounces account-wide; pause a church well before it drags us there.
  private static async isPaused(messaging: any, churchId: string): Promise<boolean> {
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);
    const [complaints, bounces, sent] = await Promise.all([
      messaging.deliveryLog.countFeedbackSince(churchId, "sesComplaint", weekAgo),
      messaging.deliveryLog.countFeedbackSince(churchId, "sesBounce", weekAgo),
      messaging.deliveryLog.countChurchEmailsSince(churchId, weekAgo)
    ]);
    return (complaints >= 2 && complaints >= sent * 0.003) || (bounces >= 10 && bounces >= sent * 0.05);
  }
}
