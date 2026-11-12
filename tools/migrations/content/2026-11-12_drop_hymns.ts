import { type Kysely } from "kysely";

// Hymns was never released: the admin page and app tab were hidden on 2026-10-28 and the feature has been removed.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("hymns").ifExists().execute();
}

export async function down(): Promise<void> {
  // The table is recreated by 2026-10-27_hymns.ts if the feature ever returns.
}
