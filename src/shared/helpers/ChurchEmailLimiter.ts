import { RepoManager } from "../infrastructure/RepoManager.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_CHURCH_DAYS = 14;
const NEW_CHURCH_DAILY_CAP = 50;
const NEW_CHURCH_POOL_DAILY_CAP = 300;
const DAILY_CAP = 2000;

// Church-authored mail goes out from our SES identity, so throwaway signups must not be able to blast it.
// New churches also share one pool, since a spammer can register a fresh church every few minutes.
export class ChurchEmailLimiter {
  static async remaining(churchId: string): Promise<number> {
    const membership = await RepoManager.getRepos<any>("membership");
    const messaging = await RepoManager.getRepos<any>("messaging");
    const church = await membership.church.loadById(churchId);
    if (!church || church.archivedDate) return 0;
    const dayAgo = new Date(Date.now() - DAY_MS);
    const sent: number = await messaging.deliveryLog.countEmailsSince([churchId], dayAgo);
    const newSince = new Date(Date.now() - NEW_CHURCH_DAYS * DAY_MS);
    if (!church.registrationDate || new Date(church.registrationDate) < newSince) return Math.max(0, DAILY_CAP - sent);
    const newChurchIds: string[] = await membership.church.loadIdsRegisteredSince(newSince);
    const poolSent: number = await messaging.deliveryLog.countEmailsSince(newChurchIds, dayAgo);
    return Math.max(0, Math.min(NEW_CHURCH_DAILY_CAP - sent, NEW_CHURCH_POOL_DAILY_CAP - poolSent));
  }

  static async record(churchId: string, contentType: string, address: string, personId?: string) {
    const messaging = await RepoManager.getRepos<any>("messaging");
    await messaging.deliveryLog.save({ churchId, personId, contentType, deliveryMethod: "email", deliveryAddress: address, success: true });
  }
}
