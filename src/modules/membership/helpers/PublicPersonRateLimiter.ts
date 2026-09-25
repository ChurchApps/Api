import type { Repos } from "../repositories/Repos.js";
import { LoginRateLimiter } from "./LoginRateLimiter.js";

// DB-backed (loginAttempts table) so the count holds across Lambda containers. Pass an ip from
// LoginRateLimiter.getClientIp; the first X-Forwarded-For hop is caller-controlled.
export class PublicPersonRateLimiter {
  static windowSeconds = 10 * 60;
  static maxHits = 10;

  static async allow(repos: Repos, ip: string, churchId: string, bucket: string, max: number = this.maxHits, windowSeconds: number = this.windowSeconds): Promise<boolean> {
    if (LoginRateLimiter.isLoopback(ip)) return true;
    const key = ("pp|" + bucket + "|" + (churchId || "") + "|" + (ip || "unknown")).slice(0, 191);
    try {
      if ((await repos.loginAttempt.loadCount(key, windowSeconds)) >= max) return false;
      await repos.loginAttempt.increment(key, windowSeconds);
      return true;
    } catch (e) {
      console.error("PublicPersonRateLimiter.allow failed:", e);
      return true;
    }
  }
}
