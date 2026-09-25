import type express from "express";
import type { Repos } from "../repositories/Repos.js";

/**
 * Throttles failed credential checks (login / verifyCredentials).
 *
 * Counters live in the `loginAttempts` table, not in process memory: the API is deployed as a
 * Lambda, so an in-memory Map is per-container and an attacker spread across warm containers
 * would barely be counted at all.
 *
 * Three buckets are checked:
 *  - account+ip: the tight per-account limit. Keyed on the caller's IP too, so one attacker
 *    hammering a victim's email only locks themselves out, not the victim.
 *  - account: a looser ceiling on the account alone, which still bounds a brute-force run
 *    spread across many IPs.
 *  - ip: broad protection against one source spraying many accounts. Only as trustworthy as
 *    `getClientIp` below, hence the much looser limit.
 *
 * A successful login clears the account buckets so a legitimate user who eventually gets their
 * password right is not left throttled. The ip bucket deliberately survives, otherwise anyone
 * holding one valid account could reset it between sprays.
 */
export class LoginRateLimiter {
  static windowSeconds = 15 * 60;
  static maxPerAccountIp = 10;
  static maxPerAccount = 30;
  // Reset-code buckets stay tight on the account alone; the per-code attempt cap is not enough on its own.
  static maxPerAccountStrict = 10;
  static maxPerIp = 50;

  /**
   * The client IP as observed by infrastructure the caller cannot forge.
   *
   * API Gateway puts the connection's source IP in requestContext, and appends it to any
   * client-supplied X-Forwarded-For — so the *last* hop is the trustworthy one. (AuditLogHelper
   * reads the first hop, which is fine for a log line but would let an attacker reset this
   * counter on every request by sending their own X-Forwarded-For.)
   */
  public static getClientIp(req: express.Request): string {
    const ctx: any = (req as any)?.apiGateway?.event?.requestContext ?? (req as any)?.requestContext;
    const sourceIp = ctx?.identity?.sourceIp || ctx?.http?.sourceIp;
    if (sourceIp) return sourceIp;

    const hops = ((req?.headers?.["x-forwarded-for"] as string) || "")
      .split(",")
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    if (hops.length > 0) return hops[hops.length - 1];

    return req?.socket?.remoteAddress || "";
  }

  public static isLoopback(ip: string): boolean {
    const host = (ip || "").replace(/^::ffff:/i, "").split("%")[0];
    return host === "127.0.0.1" || host === "::1" || host === "localhost" || host.startsWith("127.");
  }

  /** The buckets that apply to one attempt, each with its own ceiling. An unknown ip is its own bucket, never loopback. */
  private static buckets(ip: string, account: string, accountMax: number = this.maxPerAccount): { key: string; max: number }[] {
    const result: { key: string; max: number }[] = [];
    const ipKey = (ip || "unknown").slice(0, 60);
    if (account) {
      result.push({ key: "acctip|" + account.slice(0, 120) + "|" + ipKey, max: this.maxPerAccountIp });
      result.push({ key: "account|" + account.slice(0, 150), max: accountMax });
    }
    if (!this.isLoopback(ip)) result.push({ key: "ip|" + ipKey, max: this.maxPerIp });
    return result;
  }

  /** False when any bucket is over its limit. Fails open — a DB outage must not lock everyone out. */
  public static async allow(repos: Repos, ip: string, account: string, accountMax: number = this.maxPerAccount): Promise<boolean> {
    try {
      for (const bucket of this.buckets(ip, account, accountMax)) {
        const count = await repos.loginAttempt.loadCount(bucket.key, this.windowSeconds);
        if (count >= bucket.max) return false;
      }
      return true;
    } catch (e) {
      console.error("LoginRateLimiter.allow failed:", e);
      return true;
    }
  }

  public static async recordFailure(repos: Repos, ip: string, account: string): Promise<void> {
    try {
      for (const bucket of this.buckets(ip, account)) await repos.loginAttempt.increment(bucket.key, this.windowSeconds);
    } catch (e) {
      console.error("LoginRateLimiter.recordFailure failed:", e);
    }
  }

  /** Clears the account buckets only; see the note above on why the ip bucket is left alone. */
  public static async clearFailures(repos: Repos, account: string, ip: string = ""): Promise<void> {
    try {
      await repos.loginAttempt.clear(this.buckets(ip, account).filter((bucket) => !bucket.key.startsWith("ip|")).map((bucket) => bucket.key));
    } catch (e) {
      console.error("LoginRateLimiter.clearFailures failed:", e);
    }
  }
}
