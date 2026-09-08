import { type Kysely, sql } from "kysely";

// Package model: every song row carries the confidence tier the catalog computed, the rights layers
// and form map from masters/song.json, the derived sing time, and the listen-gate record that
// promotes a package to sunday-ready. JSON columns hold text; the API parses them on the way out.
const COLUMNS: [string, ReturnType<typeof sql>][] = [
  ["confidence", sql`varchar(24)`],
  ["firstLine", sql`varchar(255)`],
  ["tune", sql`varchar(120)`],
  ["hasChords", sql`tinyint(1)`],
  ["rights", sql`text`],
  ["form", sql`text`],
  ["recommendedKey", sql`varchar(8)`],
  ["recommendedKeyReason", sql`varchar(255)`],
  ["publishedKeys", sql`varchar(64)`],
  ["singTimeSeconds", sql`int`],
  ["scoreSource", sql`varchar(8)`],
  ["listenedKeys", sql`varchar(64)`],
  ["sundayReadyBy", sql`char(11)`],
  ["sundayReadyAt", sql`datetime`]
];

export async function up(db: Kysely<any>): Promise<void> {
  for (const [name, type] of COLUMNS) await db.schema.alterTable("songs").addColumn(name, type).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const [name] of [...COLUMNS].reverse()) await db.schema.alterTable("songs").dropColumn(name).execute();
}
