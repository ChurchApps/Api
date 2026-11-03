import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("planTypes").addColumn("lessonTrim", sql`text`).execute();
  await db.schema.alterTable("plans").addColumn("lessonTrimWarning", sql`varchar(500)`).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("plans").dropColumn("lessonTrimWarning").execute();
  await db.schema.alterTable("planTypes").dropColumn("lessonTrim").execute();
}
