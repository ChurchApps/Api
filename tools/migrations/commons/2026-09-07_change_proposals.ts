import { type Kysely, sql } from "kysely";

// Every submission is a change proposal of one type (new | translation | arrangement | correction |
// additionalFile | removal). Existing edits of a published asset are backfilled as corrections.
// songs.contributors is a JSON array of { name, what, submissionId, at } appended on approve.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table submissions add column type varchar(16) not null default 'new'`.execute(db);
  await sql`update submissions s join assets a on a.id = s.assetId
    set s.type = 'correction' where a.publishedSubmissionId is not null and a.publishedSubmissionId <> s.id`.execute(db);
  await sql`alter table songs add column contributors text null`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table songs drop column contributors`.execute(db);
  await sql`alter table submissions drop column type`.execute(db);
}
