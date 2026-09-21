import * as fs from "fs";
import { pathToFileURL } from "url";
import { sql } from "kysely";
import { createKysely, ensureEnvironment } from "./kysely-config.js";
import { runCommonsMigrations } from "./commons-migrate.js";
import { buildCatalog } from "./commons-seed/catalog.js";

// `commons-up` is the one command that takes a WorshipCommonsContent checkout and brings a commons
// database to match it: schema first, then an upsert of every catalog-managed row.
//
// It is additive and idempotent. Run it twice and the second run changes nothing. It never deletes:
// a live database also holds rows the content repo has never heard of — songs people uploaded,
// submissions, proposals, profile edits — and the catalog is not authority over those. Taking a song
// down is a content-repo change plus a status flip, not a prune here.
//
// buildCatalog mints a fresh random id for every author, submission and assetFile, so matching on id
// would insert the whole catalog again on a second run. Each of those tables is matched on its natural
// key instead, and the generated ids are remapped onto whatever the database already calls those rows.
// That is what lets this run against a database seeded before this tool existed.

// Authors are keyed on name alone, not name+bio+portrait: a writer who edits their bio from /profile
// must still match their own row, or `up` would insert a second author and repoint their songs at it.
// buildCatalog emits one row per name+bio+portrait, so six writers currently arrive twice; collapsing
// them here is also the right answer for the site, where one writer means one page.
const AUTHOR_KEY = (r: Record<string, unknown>) => String(r.name);

/** One author row per name, plus generated id -> surviving generated id for the ones folded in. */
function dedupeAuthors(authors: Row[]) {
  const byName = new Map<string, Row>();
  const alias = new Map<string, string>();
  for (const a of authors) {
    const first = byName.get(AUTHOR_KEY(a));
    if (first) alias.set(a.id as string, first.id as string);
    else byName.set(AUTHOR_KEY(a), a);
  }
  return { unique: [...byName.values()], alias };
}

// Columns a live row owns. buildCatalog fills them with defaults (saveCount: 0, an "Imported"
// publishedAt) which are right for a brand-new row and wrong for one that has been in front of
// churches for a month, so they are written on insert and left alone on update.
const PRESERVE: Record<string, string[]> = {
  assets: ["downloadCount", "saveCount", "ratingCount", "ratingSum", "featured", "publisherUserId", "publishedAt", "publishedSubmissionId"],
  // singTimeSeconds only because the content pipeline currently writes a naive duration.json
  // ("estimate: N lines x 4 beats @ 120 bpm", median 36s) that is worse than what prod already holds for
  // 314 songs. A new song still gets the estimate. Drop this entry once the pipeline measures real length.
  songs: ["singTimeSeconds"],
  authors: []
};

// Written only where the live row has nothing. bio, portrait and links are editable from /profile, so a
// writer's own words outrank the repo's copy — but a column the writer never filled should still get the
// repo's value rather than stay blank forever.
const FILL_IF_EMPTY: Record<string, string[]> = {
  authors: ["bio", "portraitUrl", "links"]
};

type Row = Record<string, unknown>;

const chunk = <T>(rows: T[], size = 200) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, i * size + size));

/** MySQL hands back 0/1 for a tinyint and Date for a datetime; the catalog holds booleans and strings. */
function same(a: unknown, b: unknown) {
  const norm = (v: unknown) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "1" : "0";
    if (v instanceof Date) return String(v.getTime());
    return String(v);
  };
  return norm(a) === norm(b);
}

/** Read-only: what `up` would rewrite, per table, with a sample. The gate before pointing this at prod. */
async function diff(db: any, table: string, key: string, rows: Row[]) {
  if (!rows.length) return;
  const preserve = new Set(PRESERVE[table] || []);
  const cols = Object.keys(rows[0]).filter((c) => c !== key && !preserve.has(c));
  const live = new Map<string, Row>();
  for (const part of chunk(rows.map((r) => String(r[key])), 500)) {
    const found = await db.selectFrom(table).select([key, ...cols] as any).where(key, "in", part).execute();
    found.forEach((r: Row) => live.set(String(r[key]), r));
  }
  let added = 0;
  const changed: string[] = [];
  for (const row of rows) {
    const cur = live.get(String(row[key]));
    if (!cur) { added++; continue; }
    const fields = cols.filter((c) => !same(cur[c], row[c]));
    if (fields.length) changed.push(`${row[key]}: ${fields.slice(0, 6).join(", ")}`);
  }
  console.log(`  ${table}: ${added} to insert, ${changed.length} to update`);
  changed.slice(0, 5).forEach((c) => console.log(`      ${c}`));
  if (changed.length > 5) console.log(`      … and ${changed.length - 5} more`);
}

/** INSERT … ON DUPLICATE KEY UPDATE over exactly the columns the catalog owns. Keyed on the primary key. */
async function upsert(db: any, table: string, rows: Row[]) {
  if (!rows.length) return;
  const preserve = new Set(PRESERVE[table] || []);
  const fill = new Set(FILL_IF_EMPTY[table] || []);
  const cols = Object.keys(rows[0]).filter((c) => c !== "id" && c !== "assetId" && !preserve.has(c));
  const set = Object.fromEntries(cols.map((c) => [
    c,
    fill.has(c) ? sql.raw(`coalesce(nullif(\`${c}\`, ''), values(\`${c}\`))`) : sql.raw(`values(\`${c}\`)`)
  ]));
  for (const part of chunk(rows)) {
    await db.insertInto(table).values(part).onDuplicateKeyUpdate(set).execute();
  }
}

/**
 * Read-only half of a natural-key match: generated id -> live id for rows the database already has,
 * and the rows it does not. Split out so a dry run resolves ids the same way a real run does.
 */
async function resolve(db: any, table: string, rows: Row[], key: (r: Row) => string, select: string[]) {
  const existing = await db.selectFrom(table).select(select as any).execute();
  const liveIdByKey = new Map<string, string>(existing.map((r: Row) => [key(r), r.id as string]));
  const idMap = new Map<string, string>();
  const missing: Row[] = [];
  for (const row of rows) {
    const live = liveIdByKey.get(key(row));
    idMap.set(row.id as string, live ?? (row.id as string));
    if (!live) missing.push(row);
  }
  return { idMap, missing };
}

// The content repo gitignores every output/ folder — it is rebuilt by tools/generate.mjs or fetched by
// tools/sync.mjs pull. A fresh clone therefore has sources/ and nothing else, and seeding from it would
// quietly drop every score, chart, slide deck and zip. Refuse instead of writing a degraded catalog.
function assertBuilt(assetFiles: Row[], songCount: number) {
  const withOutput = new Set(assetFiles.filter((f) => String(f.name).includes("/output/")).map((f) => f.assetId)).size;
  const share = songCount ? withOutput / songCount : 0;
  if (share >= 0.5) return;
  console.error(
    `\ncommons-up refused to run.\n` +
    `Only ${withOutput} of ${songCount} packages have built files under output/ (${Math.round(share * 100)}%).\n` +
    `output/ is gitignored, so a fresh checkout has none. Rebuild or fetch it first:\n` +
    `  node tools/sync.mjs pull      (the bucket is the operational master)\n` +
    `  node tools/generate.mjs       (rebuild from song.json + sources/)\n`
  );
  process.exit(1);
}

/** Schema, then every catalog-managed row. The one path that populates a commons database. */
export async function commonsUp(repoDir: string, dryRun = false) {
  if (!dryRun) {
    console.log("Running commons migrations...");
    await runCommonsMigrations();
  }

  console.log(`Reading ${repoDir}...`);
  const { assets, songs, authors, assetFiles, submissions } = buildCatalog(repoDir);
  assertBuilt(assetFiles as Row[], assets.length);

  const db = createKysely("commons");
  try {
    // authors first: songs.authorId points at them, and the diff must compare live ids, not generated ones
    const { unique: uniqueAuthors, alias } = dedupeAuthors(authors as Row[]);
    const authorRes = await resolve(db, "authors", uniqueAuthors, AUTHOR_KEY, ["id", "name"]);
    const liveAuthorId = (id: string) => authorRes.idMap.get(alias.get(id) ?? id) ?? id;
    for (const s of songs as Row[]) if (s.authorId) s.authorId = liveAuthorId(s.authorId as string);

    if (dryRun) {
      console.log("\nDry run — nothing is written.");
      console.log(`  authors: ${authorRes.missing.length} to insert`);
      await diff(db, "assets", "id", assets as Row[]);
      await diff(db, "songs", "assetId", songs as Row[]);
      return;
    }

    // carry each row to the id the database already uses, so the upsert updates that row instead of
    // inserting a second one under the generated id
    await upsert(db, "authors", uniqueAuthors.map((a) => ({ ...a, id: authorRes.idMap.get(a.id as string) ?? a.id })));

    // one "Imported" submission per asset — history, so insert once and never rewrite
    const subRes = await resolve(db, "submissions", submissions, (r) => String(r.assetId), ["id", "assetId"]);
    for (const part of chunk(subRes.missing)) await db.insertInto("submissions").values(part).execute();

    await upsert(db, "assets", assets);
    await upsert(db, "songs", songs);

    // seed-owned files carry no submissionId; a user upload does, and survives the replace
    const assetIds = (assets as Row[]).map((a) => a.id as string);
    for (const part of chunk(assetIds, 500)) {
      await db.deleteFrom("assetFiles").where("assetId", "in", part).where("submissionId", "is", null).execute();
    }
    for (const part of chunk(assetFiles as Row[])) await db.insertInto("assetFiles").values(part).execute();

    const orphans = await db
      .selectFrom("assets")
      .select(sql<number>`count(*)`.as("n"))
      .where("assetType", "=", "song")
      .where("id", "not in", assetIds)
      .executeTakeFirst();

    console.log(`\nUp to date: ${assets.length} songs, ${uniqueAuthors.length} authors, ${assetFiles.length} files.`);
    console.log(`  new authors: ${authorRes.missing.length}, new import records: ${subRes.missing.length}`);
    if ((orphans?.n ?? 0) > 0) console.log(`  ${orphans.n} song assets are not in this catalog — left untouched (user uploads, or a takedown that needs a status change).`);
  } finally {
    await db.destroy();
  }
}

async function main() {
  await ensureEnvironment();
  const repoDir = process.env.COMMONS_CONTENT_REPO;
  if (!repoDir || !fs.existsSync(repoDir)) {
    console.error(`commons-up: set COMMONS_CONTENT_REPO to a WorshipCommonsContent checkout (the folder holding catalog.json). Got: ${repoDir || "(unset)"}`);
    process.exit(1);
  }
  await commonsUp(repoDir, process.argv.includes("--dry-run"));
}

// only when run directly; reset-commons imports commonsUp
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("commons-up failed:", err);
    process.exit(1);
  });
}
