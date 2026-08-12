import { type Kysely, sql } from "kysely";

// "prayer" was never a real Material Symbols glyph; B1Admin's picker now offers "self_improvement" instead.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`UPDATE links SET icon = 'self_improvement' WHERE icon = 'prayer'`.execute(db);
  await sql`UPDATE elements SET answersJSON = REPLACE(answersJSON, '"icon":"prayer"', '"icon":"self_improvement"') WHERE answersJSON LIKE '%"icon":"prayer"%'`.execute(db);
}

export async function down(): Promise<void> {
  // ponytail: irreversible data fix — old value was a broken glyph, nothing to restore
}
