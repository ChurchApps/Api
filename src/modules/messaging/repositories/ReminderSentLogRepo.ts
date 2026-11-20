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
        sentAt: model.sentAt ? model.sentAt : (model.status === "sent" ? sql`NOW()` : null)
      }).execute();
    } catch (e) {
      if (!String((e as { message?: string } | null)?.message || e).match(/duplicate/i)) throw e;
    }
  }

  // Occurrence-sourced dedup: which recipients already got this occurrence.
  public async loadPersonIdsForOccurrence(occurrenceId: string): Promise<string[]> {
    const rows = await getDb().selectFrom("reminderSentLog").select(["personId"])
      .where("occurrenceId", "=", occurrenceId).where("status", "=", "sent").execute();
    return rows.map((r) => r.personId);
  }
}
