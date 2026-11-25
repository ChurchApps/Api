import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { mysqlDate } from "./MysqlDate.js";
import { ReminderOccurrence } from "../models/index.js";

const LEASE_MINUTES = 30; // a 'processing' row older than this is re-surfaced (crash recovery)

@injectable()
export class ReminderOccurrenceRepo {
  // Idempotent on occurrenceKey: upsert only if pending/cancelled, resurrect cancelled on re-expansion.
  public async upsert(model: ReminderOccurrence): Promise<void> {
    const existing = await getDb().selectFrom("reminderOccurrences").select(["id", "status"])
      .where("occurrenceKey", "=", model.occurrenceKey).executeTakeFirst();
    if (existing) {
      const status = existing.status;
      if (status === "pending" || status === "cancelled") {
        await getDb().updateTable("reminderOccurrences")
          .set({ fireAt: mysqlDate(model.fireAt), category: model.category, message: model.message, status: "pending" })
          .where("id", "=", existing.id).execute();
      }
      return;
    }
    await getDb().insertInto("reminderOccurrences").values({
      id: UniqueIdHelper.shortId(),
      churchId: model.churchId,
      definitionId: model.definitionId,
      entityType: model.entityType,
      entityId: model.entityId,
      category: model.category,
      message: model.message,
      occurrenceKey: model.occurrenceKey,
      occLocalISO: model.occLocalISO,
      fireAt: mysqlDate(model.fireAt),
      status: "pending",
      attemptCount: 0
      // A concurrent expansion can insert the same key after the select above; its row stands.
    }).onDuplicateKeyUpdate({ id: sql`id` }).execute();
  }

  public async loadByKey(occurrenceKey: string) {
    return getDb().selectFrom("reminderOccurrences").selectAll().where("occurrenceKey", "=", occurrenceKey).executeTakeFirst();
  }

  public async loadDue(limit = 100) {
    return getDb().selectFrom("reminderOccurrences").selectAll()
      .where((eb) => eb.or([
        eb.and([eb("status", "=", "pending"), eb("fireAt", "<=", sql<Date>`NOW()`)]),
        eb.and([eb("status", "=", "processing"), eb("claimedAt", "<", sql<Date>`DATE_SUB(NOW(), INTERVAL ${LEASE_MINUTES} MINUTE)`)])
      ]))
      .orderBy("fireAt")
      .limit(limit)
      .execute();
  }

  // Atomic claim: only the worker that flips pending->processing proceeds.
  public async claim(id: string): Promise<boolean> {
    const result = await getDb().updateTable("reminderOccurrences")
      .set({ status: "processing", claimedAt: sql<Date>`NOW()`, attemptCount: sql`attemptCount + 1` })
      .where("id", "=", id)
      .where((eb) => eb.or([
        eb("status", "=", "pending"),
        eb.and([eb("status", "=", "processing"), eb("claimedAt", "<", sql<Date>`DATE_SUB(NOW(), INTERVAL ${LEASE_MINUTES} MINUTE)`)])
      ]))
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  public async markSent(id: string, recipientCount: number) {
    await getDb().updateTable("reminderOccurrences")
      .set({ status: "sent", sentAt: sql<Date>`NOW()`, recipientCount }).where("id", "=", id).execute();
  }

  public async markCancelled(id: string) {
    await getDb().updateTable("reminderOccurrences").set({ status: "cancelled" }).where("id", "=", id).execute();
  }

  public async markFailed(id: string, lastError: string) {
    await getDb().updateTable("reminderOccurrences")
      .set({ status: "failed", lastError: lastError.substring(0, 500) }).where("id", "=", id).execute();
  }

  public async markRetry(id: string, lastError: string) {
    await getDb().updateTable("reminderOccurrences")
      .set({ status: "pending", lastError: lastError.substring(0, 500) }).where("id", "=", id).execute();
  }

  public async cancelPendingForEntity(churchId: string, entityType: string, entityId: string) {
    await getDb().updateTable("reminderOccurrences").set({ status: "cancelled" })
      .where("churchId", "=", churchId).where("entityType", "=", entityType).where("entityId", "=", entityId)
      .where("status", "=", "pending").execute();
  }

  public async cancelPendingForDefinition(definitionId: string) {
    await getDb().updateTable("reminderOccurrences").set({ status: "cancelled" })
      .where("definitionId", "=", definitionId).where("status", "=", "pending").execute();
  }

  public async cancelFuturePendingForDefinition(definitionId: string) {
    await getDb().updateTable("reminderOccurrences").set({ status: "cancelled" })
      .where("definitionId", "=", definitionId).where("status", "=", "pending")
      .where("fireAt", ">", sql<Date>`NOW()`).execute();
  }

  public async loadRecent(churchId: string, limit = 50) {
    return getDb().selectFrom("reminderOccurrences").selectAll()
      .where("churchId", "=", churchId).orderBy("fireAt", "desc").limit(limit).execute();
  }
}
