import { type Kysely, sql } from "kysely";

// Webhook idempotency: enforce one eventLog per (churchId, providerId) at the
// data layer. Previously only application code guarded against duplicate
// provider events (a read-then-write TOCTOU race), so concurrent webhook
// deliveries — Stripe retries aggressively — could insert duplicate rows.
export async function up(db: Kysely<any>): Promise<void> {
  // Manual/non-provider events have no provider event id; normalize "" -> NULL
  // so they are exempt from the unique index (MySQL allows repeated NULLs).
  await sql`UPDATE eventLogs SET providerId = NULL WHERE providerId = ''`.execute(db);

  // Collapse any pre-existing duplicates, keeping the earliest row per key.
  await sql`
    DELETE e1 FROM eventLogs e1
    JOIN eventLogs e2
      ON e1.churchId = e2.churchId
     AND e1.providerId = e2.providerId
     AND e1.providerId IS NOT NULL
     AND e1.id > e2.id
  `.execute(db);

  // MySQL has no DROP INDEX IF EXISTS; drop plainly and ignore "index doesn't exist" (errno 1091) to stay idempotent.
  await db.schema.dropIndex("idx_eventLogs_providerId").on("eventLogs").execute().catch((e: { errno?: number }) => { if (e?.errno !== 1091) throw e; });
  await db.schema
    .createIndex("idx_eventLogs_church_provider")
    .on("eventLogs")
    .columns(["churchId", "providerId"])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_eventLogs_church_provider").on("eventLogs").execute().catch((e: { errno?: number }) => { if (e?.errno !== 1091) throw e; });
  await db.schema.createIndex("idx_eventLogs_providerId").on("eventLogs").column("providerId").execute();
}
