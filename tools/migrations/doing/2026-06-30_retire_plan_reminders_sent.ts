import { type Kysely, sql } from "kysely";

// Retire plans.remindersSent (added 2026-06-24): serving-reminder idempotency now
// lives in the shared reminderSentLog ledger (messaging), unified with event reminders.
// Deploy invariant: apply only after the ledger-based ServingReminderHelper is live.
// No CSV->ledger backfill — a one-time same-day duplicate reminder in the rollout window is acceptable.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("plans").dropColumn("remindersSent").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("plans").addColumn("remindersSent", sql`varchar(255)`).execute();
}
