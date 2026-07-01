import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { ReminderSentLog } from "../models/index.js";

@injectable()
export class ReminderSentLogRepo {
  // The unique idempotencyKey is a fence, not a tombstone: a duplicate insert is
  // swallowed so a retry can't double-send the same recipient for an occurrence.
  public async insertIgnore(model: ReminderSentLog): Promise<void> {
    try {
      await getDb().insertInto("reminderSentLog").values({
        id: UniqueIdHelper.shortId(),
        churchId: model.churchId,
        occurrenceId: model.occurrenceId,
        entityType: model.entityType,
        entityId: model.entityId,
        personId: model.personId,
        channel: model.channel,
        category: model.category,
        status: model.status,
        reason: model.reason,
        idempotencyKey: model.idempotencyKey,
        sentAt: model.sentAt ? (model.sentAt as any) : (model.status === "sent" ? sql`NOW()` as any : null)
      }).execute();
    } catch (e: any) {
      if (!String(e?.message || e).match(/duplicate/i)) throw e;
    }
  }

  // Occurrence-sourced rows only (event reminders). Non-occurrence sources (serving) dedup via loadSentKeys.
  public async loadPersonIdsForOccurrence(occurrenceId: string): Promise<string[]> {
    const rows = await getDb().selectFrom("reminderSentLog").select(["personId"])
      .where("occurrenceId", "=", occurrenceId).where("status", "=", "sent").execute();
    return rows.map((r: any) => r.personId);
  }

  // Which of these idempotencyKeys have already been sent — the cross-source dedup fence.
  public async loadSentKeys(idempotencyKeys: string[]): Promise<string[]> {
    if (!idempotencyKeys || idempotencyKeys.length === 0) return [];
    const rows = await getDb().selectFrom("reminderSentLog").select(["idempotencyKey"])
      .where("idempotencyKey", "in", idempotencyKeys).where("status", "=", "sent").execute();
    return rows.map((r: any) => r.idempotencyKey);
  }
}
