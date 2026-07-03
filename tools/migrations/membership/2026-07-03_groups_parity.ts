import { type Kysely, sql } from "kysely";

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

async function addColumnIfMissing(db: Kysely<any>, table: string, column: string, definition: string) {
  if (await columnExists(db, table, column)) return;
  // `groups` is a reserved word since MySQL 8.0.2 — must be backtick-quoted.
  await sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`).execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await addColumnIfMissing(db, "groups", "capacity", "capacity int NULL");
  await addColumnIfMissing(db, "groups", "guestCapacity", "guestCapacity int NULL");
  // "checkinClosed" (not "closed") to avoid colliding with joinPolicy enrollment semantics.
  await addColumnIfMissing(db, "groups", "checkinClosed", "checkinClosed tinyint(1) NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "groups", "volunteerRatio", "volunteerRatio int NULL");
  await addColumnIfMissing(db, "groups", "minVolunteers", "minVolunteers int NULL");

  // Confidential (care/recovery) groups: hidden from every public/anon read path and
  // roster-gated to members + staff.
  await addColumnIfMissing(db, "groups", "confidential", "confidential bit(1) DEFAULT b'0' AFTER publicRoster");
  await sql`UPDATE \`groups\` SET confidential = b'0' WHERE confidential IS NULL`.execute(db);

  await db.schema
    .createTable("householdPickupPeople")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("householdId", sql`char(11)`, (col) => col.notNull())
    .addColumn("personId", sql`char(11)`)
    .addColumn("name", sql`varchar(100)`)
    .addColumn("photoUrl", sql`varchar(255)`)
    .addColumn("relationship", sql`varchar(50)`)
    .addColumn("status", sql`varchar(20)`, (col) => col.notNull())
    .addColumn("notes", sql`varchar(255)`)
    .addColumn("createdDate", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_householdPickup_church").on("householdPickupPeople").columns(["churchId"]).execute();
  await db.schema.createIndex("idx_householdPickup_household").on("householdPickupPeople").columns(["churchId", "householdId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("householdPickupPeople").ifExists().execute();
  await db.schema.alterTable("groups").dropColumn("confidential").execute();
  await db.schema.alterTable("groups").dropColumn("minVolunteers").execute();
  await db.schema.alterTable("groups").dropColumn("volunteerRatio").execute();
  await db.schema.alterTable("groups").dropColumn("checkinClosed").execute();
  await db.schema.alterTable("groups").dropColumn("guestCapacity").execute();
  await db.schema.alterTable("groups").dropColumn("capacity").execute();
}
