import { type Kysely, sql } from "kysely";

// Poetic meter (8.7.8.7 D, CM, LM…) — a first-class song facet the catalog filters on
// and "similar songs" scores with. Optional: most contemporary songs have none.

export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table songs add column meter varchar(30) null`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table songs drop column meter`.execute(db);
}
