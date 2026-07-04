import { type Kysely, sql } from "kysely";

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

async function indexExists(db: Kysely<any>, table: string, index: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND INDEX_NAME = ${index}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

export async function up(db: Kysely<any>): Promise<void> {
  if (!(await columnExists(db, "auditLogs", "module"))) {
    await sql.raw("ALTER TABLE auditLogs ADD COLUMN module varchar(20)").execute(db);
  }
  if (!(await columnExists(db, "auditLogs", "batchId"))) {
    await sql.raw("ALTER TABLE auditLogs ADD COLUMN batchId char(11)").execute(db);
  }
  // details widened from TEXT (64 KB) to MEDIUMTEXT (16 MB) for full before/after payloads.
  await sql.raw("ALTER TABLE auditLogs MODIFY details mediumtext").execute(db);
  // created widened to millisecond precision so the undo conflict guard can order sub-second edits.
  await sql.raw("ALTER TABLE auditLogs MODIFY created datetime(3)").execute(db);

  if (!(await indexExists(db, "auditLogs", "ix_auditLogs_batch"))) {
    await db.schema.createIndex("ix_auditLogs_batch").on("auditLogs").columns(["batchId"]).execute();
  }
  if (!(await indexExists(db, "auditLogs", "ix_auditLogs_entity"))) {
    await db.schema.createIndex("ix_auditLogs_entity").on("auditLogs").columns(["churchId", "module", "entityType", "entityId", "created"]).execute();
  }

  await db.schema
    .createTable("batches")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("userId", sql`char(11)`, (col) => col.notNull())
    .addColumn("label", sql`varchar(255)`)
    .addColumn("source", sql`varchar(30)`)
    .addColumn("status", sql`varchar(15)`, (col) => col.notNull())
    .addColumn("itemCount", sql`int`, (col) => col.defaultTo(0))
    .addColumn("created", sql`datetime`, (col) => col.notNull())
    .addColumn("completedAt", sql`datetime`)
    .addColumn("undoneAt", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  if (!(await indexExists(db, "batches", "ix_batches_church"))) {
    await db.schema.createIndex("ix_batches_church").on("batches").columns(["churchId", "created"]).execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("batches").ifExists().execute();
  await db.schema.dropIndex("ix_auditLogs_entity").on("auditLogs").ifExists().execute();
  await db.schema.dropIndex("ix_auditLogs_batch").on("auditLogs").ifExists().execute();
  await db.schema.alterTable("auditLogs").dropColumn("batchId").execute();
  await db.schema.alterTable("auditLogs").dropColumn("module").execute();
}
