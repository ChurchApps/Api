import { type Kysely, sql } from "kysely";

// Song identity moves onto the song itself (songs.songDetailId) instead of being
// derived from its first arrangement; arrangements gain their own bpm/seconds/meter/sequence.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("songs").addColumn("songDetailId", sql`char(11)`).execute();
  await db.schema
    .alterTable("arrangements")
    .addColumn("bpm", sql`int`)
    .addColumn("seconds", sql`int`)
    .addColumn("meter", sql`varchar(10)`)
    .addColumn("sequence", sql`text`)
    .execute();

  // Backfill song identity from any existing arrangement.
  await sql`update songs s join arrangements a on a.songId = s.id set s.songDetailId = a.songDetailId where s.songDetailId is null`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("songs").dropColumn("songDetailId").execute();
  await db.schema.alterTable("arrangements").dropColumn("bpm").dropColumn("seconds").dropColumn("meter").dropColumn("sequence").execute();
}
