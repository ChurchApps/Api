import { type Kysely, sql } from "kysely";

// Writer-grant catalogs use licenseVersion "permissions" (11 chars) — wider than the original varchar(10).
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table songs modify column licenseVersion varchar(32)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table songs modify column licenseVersion varchar(10)`.execute(db);
}
