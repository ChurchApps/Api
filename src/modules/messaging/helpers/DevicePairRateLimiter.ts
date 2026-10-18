import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";

// Pairing codes are four letters, so cap how many a user and a church can try. DB-backed (membership loginAttempts) to hold across Lambda containers.
export class DevicePairRateLimiter {
  static windowSeconds = 60 * 60;
  static maxPerUser = 30;
  static maxPerChurch = 60;

  /** False when the user or church is over its limit; counts this attempt otherwise. Fails open. */
  static async consume(userId: string, churchId: string): Promise<boolean> {
    const buckets = [
      { key: "devicePair:user|" + userId, max: this.maxPerUser },
      { key: "devicePair:church|" + churchId, max: this.maxPerChurch }
    ];
    try {
      const repo = (await RepoManager.getRepos<any>("membership")).loginAttempt;
      for (const b of buckets) {
        if (await repo.loadCount(b.key, this.windowSeconds) >= b.max) return false;
      }
      for (const b of buckets) await repo.increment(b.key, this.windowSeconds);
      return true;
    } catch (e) {
      console.error("DevicePairRateLimiter.consume failed:", e);
      return true;
    }
  }
}
