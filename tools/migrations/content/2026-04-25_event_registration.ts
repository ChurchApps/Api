import { type Kysely, sql } from "kysely";

// Adds the registration columns the Event model declares but the initial
// schema omitted. Without these, RegistrationController's
// `if (!event.registrationEnabled) return ...` guard always trips and the
// /mobile/register/<id> wizard short-circuits to "Registration unavailable".
//
// `tags` is also part of the Event model and is added here for parity.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("events")
    .addColumn("registrationEnabled", sql`bit(1)`, (col) => col.notNull().defaultTo(sql`b'0'`))
    .addColumn("capacity", sql`int`)
    .addColumn("registrationOpenDate", sql`datetime`)
    .addColumn("registrationCloseDate", sql`datetime`)
    .addColumn("formId", sql`char(11)`)
    .addColumn("tags", sql`varchar(255)`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("events")
    .dropColumn("registrationEnabled")
    .dropColumn("capacity")
    .dropColumn("registrationOpenDate")
    .dropColumn("registrationCloseDate")
    .dropColumn("formId")
    .dropColumn("tags")
    .execute();
}
