import { type Kysely, sql } from "kysely";

// Authenticator-app two-factor sign-in. Its own table so the users selectAll() paths can never leak the secret.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("userMfa")
    .ifNotExists()
    .addColumn("userId", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("secret", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("enabled", sql`tinyint(1)`, (col) => col.notNull().defaultTo(0))
    .addColumn("backupCodes", sql`text`)
    .addColumn("lastUsedStep", sql`bigint`)
    .addColumn("dateEnabled", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("userMfa").ifExists().execute();
}
