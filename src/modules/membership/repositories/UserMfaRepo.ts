import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UserMfa } from "../models/index.js";

// mysql2 errno for ER_NO_SUCH_TABLE. A database that has not run 2026-10-26_user_mfa yet
// has no userMfa table, which means nobody has two-factor on. Login must not 500 for that.
function isMissingTable(err: unknown): boolean {
  const e = err as { errno?: number; code?: string; message?: string; cause?: unknown };
  if (e?.errno === 1146 || e?.code === "ER_NO_SUCH_TABLE") return true;
  if (/userMfa/i.test(e?.message || "") && /doesn'?t exist/i.test(e?.message || "")) return true;
  return e?.cause ? isMissingTable(e.cause) : false;
}

@injectable()
export class UserMfaRepo {
  public async load(userId: string): Promise<UserMfa> {
    return (await getDb().selectFrom("userMfa").selectAll().where("userId", "=", userId).executeTakeFirst()) ?? null;
  }

  public async isEnabled(userId: string): Promise<boolean> {
    try {
      const row = await getDb().selectFrom("userMfa").select("enabled").where("userId", "=", userId).executeTakeFirst();
      return !!row?.enabled;
    } catch (err) {
      if (isMissingTable(err)) return false;
      throw err;
    }
  }

  /** Starts (or restarts) setup with a fresh secret; nothing is enforced until enable(). */
  public async savePending(userId: string, encryptedSecret: string): Promise<void> {
    await sql`
      INSERT INTO userMfa (userId, secret, enabled) VALUES (${userId}, ${encryptedSecret}, 0)
      ON DUPLICATE KEY UPDATE secret = IF(enabled = 1, secret, VALUES(secret))
    `.execute(getDb());
  }

  public async enable(userId: string, backupCodes: string, step: number): Promise<boolean> {
    const result = await getDb().updateTable("userMfa")
      .set({ enabled: true, backupCodes, lastUsedStep: step, dateEnabled: sql`NOW()` as any })
      .where("userId", "=", userId)
      .where("enabled", "=", false)
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  /** Atomic replay guard: only the first request to present a code for this time step wins. */
  public async claimStep(userId: string, step: number): Promise<boolean> {
    const result = await getDb().updateTable("userMfa")
      .set({ lastUsedStep: step })
      .where("userId", "=", userId)
      .where((eb) => eb.or([eb("lastUsedStep", "is", null), eb("lastUsedStep", "<", step)]))
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  /** Compare-and-swap so two requests can't spend the same backup code. */
  public async replaceBackupCodes(userId: string, expected: string, next: string): Promise<boolean> {
    const result = await getDb().updateTable("userMfa")
      .set({ backupCodes: next })
      .where("userId", "=", userId)
      .where("backupCodes", "=", expected)
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  public async delete(userId: string): Promise<void> {
    await getDb().deleteFrom("userMfa").where("userId", "=", userId).execute();
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
