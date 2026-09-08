import { type Kysely, sql } from "kysely";

// Package layout (vision/files.md 5.6): assetFiles.name now holds the catalog key itself —
// songs/<lang>/<license-section>/<slug>-<id>/{sources,masters,derivatives}/<file> — and non-Latin title slugs
// push it past the old varchar(100). Rows still holding a folder-relative name keep resolving to the legacy
// id-keyed folder; nothing is rewritten here.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("assetFiles").modifyColumn("name", sql`varchar(255)`, (col) => col.notNull()).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("assetFiles").modifyColumn("name", sql`varchar(100)`, (col) => col.notNull()).execute();
}
