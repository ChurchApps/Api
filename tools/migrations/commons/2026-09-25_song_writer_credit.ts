import { type Kysely, sql } from "kysely";

// The writer credit as submitted, when it names more than one person ("Words by Joy Marquéz • Music by Doug
// Gregan", "Thomas Ken, Jonathan Allen Wright"). songs.authorId names only the first writer, so a co-written song
// showed one name. Null keeps the author's name. Backfilled for songs uploaded through the site from their
// published submission's credit; catalog songs already carry the full credit as the author's name (and their
// imported payloads hold mojibake).
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("songs").addColumn("writerCredit", sql`varchar(500)`).execute();
  await sql`update songs s
    join assets a on a.id = s.assetId
    join submissions sub on sub.id = a.publishedSubmissionId
    set s.writerCredit = trim(json_unquote(json_extract(sub.payload, '$.detail.writer')))
    where a.publisherUserId is not null
      and json_unquote(json_extract(sub.payload, '$.detail.writer')) regexp '[,&•·/;]| and | by '`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("songs").dropColumn("writerCredit").execute();
}
