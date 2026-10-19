import { type Kysely, sql } from "kysely";

async function tableCollation(db: Kysely<any>, table: string): Promise<string | null> {
  const result = await sql<{ collation: string }>`
    SELECT TABLE_COLLATION as collation
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
  `.execute(db);
  return (result.rows[0] as any)?.collation ?? null;
}

/**
 * Give `table` the same character set and collation as `reference`, so the two can be compared and
 * joined. A table created without DEFAULT CHARSET inherits the database's default collation
 * (utf8mb4_unicode_ci in prod and demo), while the other commons tables carry DEFAULT CHARSET=utf8mb4
 * and so MySQL 8's utf8mb4_0900_ai_ci. Comparing the two is ER_CANT_AGGREGATE_2COLLATIONS.
 */
export async function alignCollation(db: Kysely<any>, table: string, reference: string): Promise<boolean> {
  const [have, want] = await Promise.all([tableCollation(db, table), tableCollation(db, reference)]);
  if (!have || !want || have === want) return false;
  const charset = want.split("_")[0];
  await sql.raw(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET ${charset} COLLATE ${want}`).execute(db);
  return true;
}

// assetPublishers (2026-10-17) was created without DEFAULT CHARSET and came out utf8mb4_unicode_ci; every query
// that compares it with assets or submissions failed in prod from 2026-10-18 15:38Z (/commons/*/mine, commonsWriterStats).
export async function up(db: Kysely<any>): Promise<void> {
  await alignCollation(db, "assetPublishers", "assets");
}

export async function down(): Promise<void> {
  // Nothing to undo: the table keeps the collation that matches its neighbours.
}
