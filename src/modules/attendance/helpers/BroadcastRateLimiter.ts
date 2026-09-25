import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";

// Kiosk tokens can broadcast SMS, so cap how often a church can do it. DB-backed (membership loginAttempts) to hold across Lambda containers.
export class BroadcastRateLimiter {
  static windowSeconds = 60 * 60;
  static maxPerChurch = 10;

  /** False when the church is over its limit; counts this call otherwise. Fails open. */
  static async consume(churchId: string): Promise<boolean> {
    const key = "checkinBroadcast|" + churchId;
    try {
      const repo = (await RepoManager.getRepos<any>("membership")).loginAttempt;
      if (await repo.loadCount(key, this.windowSeconds) >= this.maxPerChurch) return false;
      await repo.increment(key, this.windowSeconds);
      return true;
    } catch (e) {
      console.error("BroadcastRateLimiter.consume failed:", e);
      return true;
    }
  }
}
