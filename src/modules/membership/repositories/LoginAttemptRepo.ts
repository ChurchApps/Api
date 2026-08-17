import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";

/**
 * Failed-login counters, one row per rate-limit key (account or IP).
 * Backed by the database rather than process memory because the API runs on Lambda:
 * every concurrent container has its own heap, so an in-memory counter would only ever
 * see a fraction of an attacker's attempts.
 */
@injectable()
export class LoginAttemptRepo {
  /** Attempts recorded for this key inside the current window; rows older than the window count as 0. */
  public async loadCount(attemptKey: string, windowSeconds: number): Promise<number> {
    const row = await getDb()
      .selectFrom("loginAttempts")
      .select("attemptCount")
      .where("attemptKey", "=", attemptKey)
      .where("windowStart", ">", sql`DATE_SUB(NOW(), INTERVAL ${windowSeconds} SECOND)` as any)
      .executeTakeFirst();
    return Number((row as any)?.attemptCount ?? 0);
  }

  /**
   * Adds one attempt to the key, rolling the window over when the existing row has expired.
   * A single upsert so concurrent Lambda containers cannot lose each other's increments.
   * The assignments run left to right, so attemptCount still sees the pre-update windowStart.
   */
  public async increment(attemptKey: string, windowSeconds: number): Promise<void> {
    const cutoff = sql`DATE_SUB(NOW(), INTERVAL ${windowSeconds} SECOND)`;
    await sql`
      INSERT INTO loginAttempts (id, attemptKey, attemptCount, windowStart)
      VALUES (${UniqueIdHelper.shortId()}, ${attemptKey}, 1, NOW())
      ON DUPLICATE KEY UPDATE
        attemptCount = IF(windowStart < ${cutoff}, 1, attemptCount + 1),
        windowStart = IF(windowStart < ${cutoff}, NOW(), windowStart)
    `.execute(getDb());
  }

  public async clear(attemptKeys: string[]): Promise<void> {
    if (!attemptKeys.length) return;
    await getDb().deleteFrom("loginAttempts").where("attemptKey", "in", attemptKeys).execute();
  }

  /** Retention sweep for keys nobody has touched in a while (timer job). */
  public async deleteOld(days: number = 1): Promise<void> {
    await getDb()
      .deleteFrom("loginAttempts")
      .where("windowStart", "<", sql`DATE_SUB(NOW(), INTERVAL ${days} DAY)` as any)
      .execute();
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
