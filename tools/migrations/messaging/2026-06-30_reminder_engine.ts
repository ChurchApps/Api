import { type Kysely, sql } from "kysely";

// Phase 1 — reminder engine (architecture §5.2) + Phase 2 per-entity mute (§4.1).
// Scan-window outbox over MySQL: definitions describe "remind people about this
// entity at these offsets/clock time"; the expander materializes per-occurrence
// fire rows; the dispatcher claims due rows and produces Notifications.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable("reminderDefinitions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("entityType", sql`varchar(24)`, (col) => col.notNull())
    .addColumn("entityId", sql`char(11)`)
    .addColumn("scopeId", sql`char(11)`)
    .addColumn("category", sql`varchar(40)`, (col) => col.notNull().defaultTo("event_reminders"))
    .addColumn("offsets", sql`varchar(64)`, (col) => col.notNull().defaultTo("1440"))
    .addColumn("sendLocalTime", sql`time`, (col) => col.notNull().defaultTo("09:00:00"))
    .addColumn("timeZone", sql`varchar(64)`)
    .addColumn("message", sql`varchar(500)`)
    .addColumn("channels", sql`varchar(64)`, (col) => col.notNull().defaultTo("push,email,in_app"))
    .addColumn("recipientMode", sql`varchar(24)`, (col) => col.notNull().defaultTo("auto"))
    .addColumn("enabled", sql`tinyint(1)`, (col) => col.notNull().defaultTo(sql`1`))
    .addColumn("dateCreated", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("dateModified", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  // MySQL allows multiple NULLs in a unique index, so each partial key only
  // constrains rows where its discriminator is set (entityId xor scopeId).
  await db.schema.createIndex("ux_reminder_entity").on("reminderDefinitions").columns(["churchId", "entityType", "entityId"]).unique().execute();
  await db.schema.createIndex("ux_reminder_scope").on("reminderDefinitions").columns(["churchId", "entityType", "scopeId"]).unique().execute();
  await db.schema.createIndex("ix_reminder_enabled").on("reminderDefinitions").columns(["churchId", "enabled"]).execute();

  await db.schema.createTable("reminderOccurrences")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("definitionId", sql`char(11)`, (col) => col.notNull())
    .addColumn("entityType", sql`varchar(24)`, (col) => col.notNull())
    .addColumn("entityId", sql`char(11)`, (col) => col.notNull())
    .addColumn("category", sql`varchar(40)`, (col) => col.notNull())
    .addColumn("message", sql`varchar(500)`)
    .addColumn("occurrenceKey", sql`varchar(96)`, (col) => col.notNull())
    .addColumn("occLocalISO", sql`varchar(40)`, (col) => col.notNull())
    .addColumn("fireAt", sql`datetime`, (col) => col.notNull())
    .addColumn("status", sql`varchar(12)`, (col) => col.notNull().defaultTo("pending"))
    .addColumn("claimedAt", sql`datetime`)
    .addColumn("attemptCount", sql`int`, (col) => col.notNull().defaultTo(0))
    .addColumn("sentAt", sql`datetime`)
    .addColumn("recipientCount", sql`int`)
    .addColumn("lastError", sql`varchar(512)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("ux_occ").on("reminderOccurrences").columns(["occurrenceKey"]).unique().execute();
  await db.schema.createIndex("ix_due").on("reminderOccurrences").columns(["status", "fireAt"]).execute();

  await db.schema.createTable("reminderSentLog")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("occurrenceId", sql`char(11)`) // null for non-occurrence sources (e.g. serving reminders)
    .addColumn("entityType", sql`varchar(24)`) // source discriminator for the unified cross-source ledger
    .addColumn("entityId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`, (col) => col.notNull())
    .addColumn("channel", sql`varchar(16)`, (col) => col.notNull())
    .addColumn("category", sql`varchar(40)`, (col) => col.notNull())
    .addColumn("status", sql`varchar(12)`, (col) => col.notNull())
    .addColumn("reason", sql`varchar(40)`)
    .addColumn("idempotencyKey", sql`char(64)`, (col) => col.notNull())
    .addColumn("sentAt", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("ux_idem").on("reminderSentLog").columns(["idempotencyKey"]).unique().execute();
  await db.schema.createIndex("ix_cap").on("reminderSentLog").columns(["churchId", "personId", "channel", "category", "sentAt"]).execute();

  // Phase 2 — per-entity mute (Slack/PC parity, architecture §4.1).
  await db.schema.createTable("notificationEntityMutes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("personId", sql`char(11)`, (col) => col.notNull())
    .addColumn("entityType", sql`varchar(32)`, (col) => col.notNull())
    .addColumn("entityId", sql`char(11)`, (col) => col.notNull())
    .addColumn("level", sql`varchar(12)`, (col) => col.notNull().defaultTo("all"))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("ux_entity_mute").on("notificationEntityMutes").columns(["churchId", "personId", "entityType", "entityId"]).unique().execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("notificationEntityMutes").ifExists().execute();
  await db.schema.dropTable("reminderSentLog").ifExists().execute();
  await db.schema.dropTable("reminderOccurrences").ifExists().execute();
  await db.schema.dropTable("reminderDefinitions").ifExists().execute();
}
