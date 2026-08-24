import { type Kysely, sql } from "kysely";

// Per-file url/bytes columns collapse into assets.path (the storage folder, stored once)
// plus assets.files (comma-separated conventional file names), and the denormalized
// writer fields move to an authors table referenced by songs.authorId. Values are always
// bare storage keys — never absolute URLs. Object renames to the conventional names are
// done by tools/manual/commons-relocate-files.ts, which must run BEFORE this migration
// on any environment with real stored files (local dev just re-runs reset-commons).

const UPLOADS: [string, string][] = [["demoAudioUrl", "demoAudio"], ["sheetPdfUrl", "sheetPdf"], ["stemsZipUrl", "stemsZip"]];
const REPO_FILES: string[] = ["thumbPath", "midiUrl", "abcUrl", "lyricsUrl"];

function normalize(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("commons/")) return url;
  const idx = url.indexOf("/commons/");
  return idx >= 0 ? url.slice(idx + 1) : null;
}

function extOf(name: string, fallback: string): string {
  const ext = name.includes(".") ? name.split(".").pop() || "" : "";
  return ext.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || fallback;
}

// duplicated from ContentLibraryHelper on purpose — migrations must not track evolving app code
function slugify(title: string): string {
  return title.normalize("NFC").toLowerCase()
    .replace(/['’ʼ]/gu, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

const LANG_CODES: Record<string, string> = { English: "en", German: "de", Spanish: "es", Latin: "la", French: "fr", Portuguese: "pt", Russian: "ru", Malayalam: "ml", Albanian: "sq", Hungarian: "hu", Zulu: "zu" };

export interface FileOp { from: string; to: string; copyOnly: boolean; }

/** Shared by the DB backfill and the relocate script so both agree on the mapping. */
export function planSongFiles(row: any): { path: string; files: string[]; ops: FileOp[] } {
  const files: string[] = [];
  const ops: FileOp[] = [];
  const dirname = (key: string) => key.slice(0, key.lastIndexOf("/"));
  const basename = (key: string) => key.slice(key.lastIndexOf("/") + 1);
  const uploadDefaults: Record<string, string> = { demoAudio: "mp3", sheetPdf: "pdf", stemsZip: "zip" };

  let path: string;
  if (row.status === "pending") path = `commons/pending/${row.id}`;
  else {
    const keys = [...REPO_FILES, ...UPLOADS.map(([col]) => col)].map((col) => normalize(row[col])).filter((k): k is string => !!k);
    path = keys.filter((k) => k.startsWith("commons/songs/")).map(dirname)[0]
      || `commons/songs/${LANG_CODES[row.language || ""] || "en"}/${row.license === "PD" ? "public-domain" : "wc-license"}/${slugify(row.title || "")}--${row.id}`;
  }

  const add = (key: string, name: string) => {
    if (files.includes(name)) return;
    files.push(name);
    if (key !== `${path}/${name}`) ops.push({ from: key, to: `${path}/${name}`, copyOnly: dirname(key) !== path });
  };
  for (const [col, field] of UPLOADS) {
    const key = normalize(row[col]);
    if (key) add(key, `${field}.${extOf(basename(key), uploadDefaults[field])}`);
  }
  for (const col of REPO_FILES) {
    const key = normalize(row[col]);
    if (key) add(key, basename(key));
  }
  return { path, files, ops };
}

export function planAssetFiles(row: any): { path: string; files: string[]; ops: FileOp[] } | null {
  const contentKey = normalize(row.contentPath);
  if (!contentKey) return null;
  const path = contentKey.slice(0, contentKey.lastIndexOf("/"));
  const files: string[] = [];
  const ops: FileOp[] = [];
  const add = (key: string, name: string) => {
    files.push(name);
    if (key !== `${path}/${name}`) ops.push({ from: key, to: `${path}/${name}`, copyOnly: false });
  };
  add(contentKey, `content.${extOf(contentKey.slice(contentKey.lastIndexOf("/") + 1), "bin")}`);
  const thumbKey = normalize(row.thumbPath);
  if (thumbKey) add(thumbKey, `thumb.${extOf(thumbKey.slice(thumbKey.lastIndexOf("/") + 1), "png")}`);
  return { path, files, ops };
}

const PORTRAIT_KEY = sql`CASE WHEN writerPortraitUrl IS NULL THEN NULL
  WHEN locate('/commons/', writerPortraitUrl) > 0 THEN substring(writerPortraitUrl, locate('/commons/', writerPortraitUrl) + 1)
  ELSE writerPortraitUrl END`;

export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table assets add column path varchar(255) null, add column files varchar(500) null`.execute(db);

  await db.schema
    .createTable("authors")
    .addColumn("id", sql`char(11)`, (col) => col.primaryKey())
    .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("bio", sql`varchar(1000)`)
    .addColumn("portraitUrl", sql`varchar(255)`)
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await sql`alter table songs add column authorId char(11) null`.execute(db);

  // uuid-substring rather than the app's shortId — a migration has no access to UniqueIdHelper
  await sql`insert into authors (id, name, bio, portraitUrl)
    select substring(replace(uuid(), '-', ''), 1, 11), writer, writerBio, ${PORTRAIT_KEY}
    from songs where writer is not null and writer <> ''
    group by writer, writerBio, writerPortraitUrl`.execute(db);
  await sql`update songs s join authors a
      on a.name = s.writer and (a.bio <=> s.writerBio)
      and (a.portraitUrl <=> (CASE WHEN s.writerPortraitUrl IS NULL THEN NULL
        WHEN locate('/commons/', s.writerPortraitUrl) > 0 THEN substring(s.writerPortraitUrl, locate('/commons/', s.writerPortraitUrl) + 1)
        ELSE s.writerPortraitUrl END))
    set s.authorId = a.id`.execute(db);

  const songRows = await db.selectFrom("songs").innerJoin("assets", "assets.id", "songs.assetId")
    .select(["assets.id as id", "assets.status as status", "assets.name as title", "assets.language as language",
      "assets.license as license", "assets.thumbPath as thumbPath", "songs.demoAudioUrl", "songs.sheetPdfUrl",
      "songs.stemsZipUrl", "songs.midiUrl", "songs.abcUrl", "songs.lyricsUrl"]).execute();
  for (const row of songRows) {
    const plan = planSongFiles(row);
    await db.updateTable("assets").set({ path: plan.path, files: plan.files.join(",") || null }).where("id", "=", row.id).execute();
  }

  const assetRows = await db.selectFrom("assets").select(["id", "contentPath", "thumbPath"]).where("assetType", "!=", "song").execute();
  for (const row of assetRows) {
    const plan = planAssetFiles(row);
    if (plan) await db.updateTable("assets").set({ path: plan.path, files: plan.files.join(",") }).where("id", "=", row.id).execute();
  }

  await sql`alter table songs drop column writer, drop column writerBio, drop column writerPortraitUrl,
    drop column demoAudioUrl, drop column demoAudioBytes, drop column sheetPdfUrl, drop column sheetPdfBytes,
    drop column stemsZipUrl, drop column stemsZipBytes, drop column midiUrl, drop column midiBytes,
    drop column lyricsUrl, drop column abcUrl`.execute(db);
  await sql`alter table assets drop column contentPath, drop column thumbPath, drop column sizeBytes`.execute(db);
}

// Best effort: bytes values are unrecoverable (they were write-only) and renamed objects
// stay at their conventional names — the rebuilt url columns point at those keys.
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table songs add column writer varchar(255) null, add column writerBio varchar(1000) null,
    add column writerPortraitUrl varchar(255) null, add column demoAudioUrl varchar(255) null, add column demoAudioBytes int null,
    add column sheetPdfUrl varchar(255) null, add column sheetPdfBytes int null, add column stemsZipUrl varchar(255) null,
    add column stemsZipBytes int null, add column midiUrl varchar(255) null, add column midiBytes int null,
    add column lyricsUrl varchar(255) null, add column abcUrl varchar(255) null`.execute(db);
  await sql`alter table assets add column contentPath varchar(255) null, add column thumbPath varchar(255) null, add column sizeBytes int null`.execute(db);

  await sql`update songs s join authors a on a.id = s.authorId
    set s.writer = a.name, s.writerBio = a.bio, s.writerPortraitUrl = a.portraitUrl`.execute(db);

  const KEY_TO_COL: Record<string, string> = { demoAudio: "demoAudioUrl", sheetPdf: "sheetPdfUrl", stemsZip: "stemsZipUrl", "tune.mid": "midiUrl", "tune.abc": "abcUrl", "timing.json": "lyricsUrl", art: "thumbPath", content: "contentPath", thumb: "thumbPath" };
  const rows = await db.selectFrom("assets").select(["id", "path", "files"]).where("files", "is not", null).execute();
  for (const row of rows) {
    const songCols: Record<string, string> = {};
    const assetCols: Record<string, string> = {};
    for (const name of String(row.files).split(",").filter(Boolean)) {
      const key = KEY_TO_COL[name] ? name : name.replace(/\.[^.]+$/, "");
      const col = KEY_TO_COL[key];
      if (!col) continue;
      const target = col.endsWith("Url") ? songCols : assetCols;
      target[col] = `${row.path}/${name}`;
    }
    if (Object.keys(songCols).length) await db.updateTable("songs").set(songCols).where("assetId", "=", row.id).execute();
    if (Object.keys(assetCols).length) await db.updateTable("assets").set(assetCols).where("id", "=", row.id).execute();
  }

  await sql`alter table songs drop column authorId`.execute(db);
  await db.schema.dropTable("authors").ifExists().execute();
  await sql`alter table assets drop column path, drop column files`.execute(db);
}
