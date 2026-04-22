import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("verificationCode", sql`varchar(255)`)
    .addColumn("verificationExpires", sql`datetime`)
    .addColumn("verificationAttempts", sql`tinyint`, (col) => col.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("users")
    .dropColumn("verificationCode")
    .dropColumn("verificationExpires")
    .dropColumn("verificationAttempts")
    .execute();
}
