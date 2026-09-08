import * as fs from "fs";
import * as path from "path";
import { UniqueIdHelper } from "@churchapps/apihelper";

// The catalog master lives in the WorshipCommonsContent repo (catalog.json at its root).
// Each row becomes an assets row (the spine, keyed by the frozen song id), a songs satellite
// row, an authors row per distinct writer, one live assetFiles row per media file, and one
// approved "Imported" submission so every asset starts with a non-empty history. Media is
// copied into the id-keyed live folder commons/assets/song/{id}/{name} ("copies").
//
// Every row also has a package dir in the repo (songs/<lang>/<license>/<slug>/) whose
// masters/song.json carries rights and form, and whose derivatives/ folder carries the
// generated files the site serves flat next to the sources.

const SONG_COLS = [
  "year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "hymnalCount", "chordPro", "videoUrl", "parentSongId", "relationLabel", "licenseVersion", "licenseUrl", "proAnswer", "certified", "confidence"
];
const FILE_COLS = ["artUrl", "midiUrl", "lyricsUrl", "abcUrl", "demoAudioUrl", "sheetPdfUrl", "stemsZipUrl"];
const DETAIL_COLS = ["year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "chordPro", "videoUrl", "parentSongId", "relationLabel", "proAnswer"];
// generated files copied into the live folder when the package has them
const DERIVATIVES = ["score.musicxml", "slides.json", "chart.chordpro", "chart.pdf", "attribution.txt", "duration.json", "cover-thumb.webp"];
// a song without its own inherits these from its work — exactly the way abcUrl already resolves through works/<slug>
const WORK_DERIVATIVES = new Set(["score.musicxml", "cover-thumb.webp"]);
const PACKAGE_SUBDIR = /\/(sources|masters|derivatives)\/.*$/;
const CHORD = /\[[A-G][#b]?[^\]]*\]/;
const STANZA_LABEL = /^(verse|chorus|refrain|bridge|pre-?chorus|intro|outro|tag|ending|interlude|coda)\b/i;

/** Directories of the content repo that are mirrored as-is into the commons content store. */
export const MIRRORED_DIRS = ["writers"];

interface Package { dir: string | null; workDir: string | null; song: any; }

function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// mirrors DuplicateHelper.firstLine / SongPackageHelper.firstLine (tools/ cannot import src/)
function firstLine(chordPro: string): string | null {
  for (const raw of (chordPro || "").split(/\r?\n/)) {
    const line = raw.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
    if (!line || line.startsWith("{") || STANZA_LABEL.test(line)) continue;
    return line.slice(0, 255);
  }
  return null;
}

/** id → package dir for rows whose paths all point at a work: walks songs/<lang>/<license>/<slug>/masters/song.json once. */
function indexPackages(repoDir: string): Map<string, string> {
  const index = new Map<string, string>();
  const songsDir = path.join(repoDir, "songs");
  if (!fs.existsSync(songsDir)) return index;
  const dirs = (d: string) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const lang of dirs(songsDir)) {
    for (const license of dirs(path.join(songsDir, lang))) {
      for (const slug of dirs(path.join(songsDir, lang, license))) {
        const rel = ["songs", lang, license, slug].join("/");
        const id = readJson(path.join(repoDir, rel, "masters", "song.json"))?.id;
        if (id) index.set(id, rel);
      }
    }
  }
  return index;
}

function resolvePackage(repoDir: string, row: any, index: () => Map<string, string>): Package {
  const paths: string[] = FILE_COLS.map((c) => row[c]).filter((v) => typeof v === "string" && PACKAGE_SUBDIR.test(v));
  const dir = paths.find((p) => p.startsWith("songs/"))?.replace(PACKAGE_SUBDIR, "") || index().get(row.id) || null;
  const song = dir ? readJson(path.join(repoDir, dir, "masters", "song.json")) : null;
  const workDir = paths.find((p) => p.startsWith("works/"))?.replace(PACKAGE_SUBDIR, "") || (song?.workRef ? `works/${song.workRef}` : null);
  return { dir, workDir, song };
}

/** repo-relative path of a derivative: the package's own, else the work's for the inheritable ones. */
function derivativePath(repoDir: string, pkg: Package, name: string): string | null {
  const candidates = [pkg.dir, WORK_DERIVATIVES.has(name) ? pkg.workDir : null].filter((d): d is string => !!d);
  for (const dir of candidates) {
    const rel = `${dir}/derivatives/${name}`;
    if (fs.existsSync(path.join(repoDir, rel))) return rel;
  }
  return null;
}

export function buildCatalog(repoDir: string) {
  const catalogPath = path.join(repoDir, "catalog.json");
  if (!fs.existsSync(catalogPath)) throw new Error(`No catalog.json at ${repoDir} — point COMMONS_CONTENT_REPO at a WorshipCommonsContent checkout`);
  const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

  const assets: any[] = [];
  const songs: any[] = [];
  const authors: any[] = [];
  const assetFiles: any[] = [];
  const submissions: any[] = [];
  const authorIdByKey: Record<string, string> = {};
  const copies: { from: string; to: string }[] = [];
  const now = new Date();
  let packageIndex: Map<string, string> | undefined;
  const index = () => (packageIndex ||= indexPackages(repoDir));

  for (const row of raw.rows) {
    const pkg = resolvePackage(repoDir, row, index);
    const seen = new Set<string>();
    const addFile = (from: string) => {
      const base = from.split("/").pop() || "";
      if (seen.has(base)) return;
      seen.add(base);
      const src = path.join(repoDir, from);
      assetFiles.push({ id: UniqueIdHelper.shortId(), assetId: row.id, submissionId: null, name: base, action: "add", sizeBytes: fs.existsSync(src) ? fs.statSync(src).size : null, uploadedBy: row.submittedBy || null });
      copies.push({ from, to: `assets/song/${row.id}/${base}` });
    };
    for (const c of FILE_COLS) if (row[c]) addFile(row[c]);
    const served: Record<string, string | null> = {};
    for (const name of DERIVATIVES) {
      served[name] = derivativePath(repoDir, pkg, name);
      if (served[name]) addFile(served[name] as string);
    }

    let authorId: string | null = null;
    if (row.writer) {
      const key = [row.writer, row.writerBio || "", row.writerPortraitUrl || ""].join("|");
      authorId = authorIdByKey[key];
      if (!authorId) {
        authorId = UniqueIdHelper.shortId();
        authorIdByKey[key] = authorId;
        authors.push({ id: authorId, name: row.writer, bio: row.writerBio || null, portraitUrl: row.writerPortraitUrl ? `commons/${row.writerPortraitUrl}` : null });
      }
    }

    const pending = row.status === "pending";
    const submissionId = UniqueIdHelper.shortId();
    const detail: Record<string, unknown> = { writer: row.writer, certified: true };
    for (const c of DETAIL_COLS) if (row[c] !== undefined && row[c] !== null) detail[c] = row[c];
    submissions.push({
      id: submissionId,
      assetId: row.id,
      submittedBy: row.submittedBy || "seed",
      status: pending ? "pending" : "approved",
      payload: JSON.stringify({ name: row.title, tags: row.themes, language: row.language, license: row.license, detail }),
      note: "Imported",
      submittedAt: now,
      reviewedAt: pending ? null : now
    });
    assets.push({
      id: row.id,
      assetType: "song",
      name: row.title,
      tags: row.themes,
      language: row.language,
      license: row.license,
      publisherUserId: row.submittedBy,
      status: pending ? "pending" : "published",
      publishedAt: pending ? null : now,
      publishedSubmissionId: pending ? null : submissionId,
      downloadCount: 0,
      ratingCount: 0,
      ratingSum: 0,
      featured: 0
    });
    const song: any = { assetId: row.id, authorId };
    for (const c of SONG_COLS) if (row[c] !== undefined) song[c] = row[c];
    Object.assign(song, packageColumns(repoDir, row, pkg, served));
    songs.push(song);
  }
  return { assets, songs, authors, assetFiles, submissions, copies };
}

/** The package-model columns: what song.json, duration.json and the served derivatives say about the row. */
function packageColumns(repoDir: string, row: any, pkg: Package, served: Record<string, string | null>): Record<string, unknown> {
  const duration = served["duration.json"] ? readJson(path.join(repoDir, served["duration.json"])) : null;
  const seconds = Number(duration?.seconds);
  const pinned = Array.isArray(pkg.song?.pipeline?.publishedKeys) ? pkg.song.pipeline.publishedKeys : null;
  return {
    confidence: row.confidence ?? null,
    firstLine: firstLine(row.chordPro || ""),
    hasChords: CHORD.test(row.chordPro || ""),
    tune: null,
    meter: row.meter ?? pkg.song?.meter ?? null,
    rights: pkg.song?.rights ? JSON.stringify(pkg.song.rights) : null,
    form: pkg.song?.form ? JSON.stringify(pkg.song.form) : null,
    singTimeSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null,
    // no package has a proofread masters/score.musicxml yet: every served score was converted from the abc
    scoreSource: served["score.musicxml"] ? "abc" : null,
    publishedKeys: JSON.stringify(pinned || (row.songKey ? [row.songKey] : []))
  };
}
