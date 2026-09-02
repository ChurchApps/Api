import { type Kysely, sql } from "kysely";

// A writer profile the submitting user owns: authors.userId is the claim (set at publish when
// the row is unclaimed and the song credits exactly one writer), authors.links is a JSON array
// of {label,url} the writer maintains. Both nullable — catalog authors have no user behind them.
// bio widens to 2000 so a writer has room for a real self-description.

export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table authors add column userId char(11) null, add column links text null,
    modify column bio varchar(2000) null`.execute(db);
  await db.schema.createIndex("idx_authors_user").on("authors").column("userId").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_authors_user").on("authors").execute();
  await sql`alter table authors drop column userId, drop column links, modify column bio varchar(1000) null`.execute(db);
}
