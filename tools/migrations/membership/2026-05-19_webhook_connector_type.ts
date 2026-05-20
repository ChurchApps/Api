import { type Kysely, sql } from "kysely";

// Phase 3 of the integration platform: the Slack/Discord notifier.
//
// A webhook's `connectorType` selects how the delivery worker formats the
// outbound body. `standard` (the default — every existing webhook) sends the
// raw {event,churchId,occurredAt,data} envelope. `slack`/`discord` send a
// human-readable {text}/{content} message that those services' incoming
// webhooks accept directly.

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE webhooks ADD COLUMN connectorType VARCHAR(20) NOT NULL DEFAULT 'standard'`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE webhooks DROP COLUMN connectorType`.execute(db);
}
