import { type Kysely, sql } from "kysely";

async function tableExists(db: Kysely<any>, table: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

export async function up(db: Kysely<any>): Promise<void> {
  if (!(await tableExists(db, "personFields"))) {
    await db.schema
      .createTable("personFields")
      .ifNotExists()
      .addColumn("id", sql`varchar(36)`, (col) => col.notNull().primaryKey())
      .addColumn("churchId", sql`varchar(36)`)
      .addColumn("name", sql`varchar(100)`)
      .addColumn("fieldType", sql`varchar(50)`)
      .addColumn("choices", sql`text`)
      .addColumn("sort", sql`int`)
      .modifyEnd(sql`ENGINE=InnoDB`)
      .execute();
    await db.schema.createIndex("idx_personFields_churchId").on("personFields").columns(["churchId"]).execute();
  }

  if (!(await tableExists(db, "personFieldValues"))) {
    await db.schema
      .createTable("personFieldValues")
      .ifNotExists()
      .addColumn("id", sql`varchar(36)`, (col) => col.notNull().primaryKey())
      .addColumn("churchId", sql`varchar(36)`)
      .addColumn("personId", sql`varchar(36)`)
      .addColumn("fieldId", sql`varchar(36)`)
      .addColumn("value", sql`varchar(4000)`)
      .modifyEnd(sql`ENGINE=InnoDB`)
      .execute();
    await db.schema.createIndex("idx_personFieldValues_church_person").on("personFieldValues").columns(["churchId", "personId"]).execute();
    await db.schema.createIndex("idx_personFieldValues_church_field").on("personFieldValues").columns(["churchId", "fieldId"]).execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("personFieldValues").ifExists().execute();
  await db.schema.dropTable("personFields").ifExists().execute();
}
