import { type Kysely, sql } from "kysely";

// ABC conversion is a typeset score, same tier as an uploaded MusicXML master.
// Public ranking is downloads + saves; star ratings stop being a product surface.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table assets add column saveCount int not null default 0`.execute(db);
  await sql`update assets a join (select assetId, count(*) as n from assetRatings where saved = 1 group by assetId) r on r.assetId = a.id set a.saveCount = r.n`.execute(db);
  await sql`update songs set confidence = 'score' where confidence in ('proofread-score', 'converted-from-abc')`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table assets drop column saveCount`.execute(db);
}
