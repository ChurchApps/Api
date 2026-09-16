import { type Kysely, sql } from "kysely";

// Writer-supplied CCLI song id (Larry Holder and similar). Presence does not mean
// a church must report — that is songs.ccliReport / the license registry.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("songs").addColumn("ccli", sql`varchar(16)`).execute();
  await db.updateTable("songs").set({ ccli: "7280619" }).where("assetId", "=", "36pJc-2dIAU").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("songs").dropColumn("ccli").execute();
}
