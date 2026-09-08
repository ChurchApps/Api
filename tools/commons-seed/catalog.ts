import * as fs from "fs";
import * as path from "path";
import { UniqueIdHelper } from "@churchapps/apihelper";

// The content repo (WorshipCommonsContent) is a tree of packages: songs/<lang>/<license>/<slug>/ and
// works/<slug>/, each with sources/ (came from somewhere else), masters/ (a person asserted it) and
// derivatives/ (the pipeline built it). catalog.json at its root is an index of those packages.
//
// Each package becomes an assets row (the spine, keyed by the frozen song id), a songs satellite row,
// an authors row per distinct writer, one live assetFiles row per served file, and one approved
// "Imported" submission so every asset starts with a non-empty history.
//
// The song row is built from masters/song.json + masters/lyrics.chordpro (+ sources/hymnary.json,
// sources/video.json, derivatives/duration.json); the catalog row only supplies what the package lacks
// (id, package paths, confidence, parentSongId, writer bio/portrait). Files are copied into the id-keyed
// live folder commons/assets/song/{id}/ keeping their package folder, so assetFiles.name is the
// package-relative name ("sources/tune.mid", "derivatives/slides.json"). Files a song inherits from its
// work land in the song's own package under the same folder.

const SONG_COLS = [
  "year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "hymnalCount", "chordPro", "videoUrl", "parentSongId", "relationLabel", "licenseVersion", "licenseUrl", "proAnswer", "certified", "confidence"
];
const FILE_COLS = ["artUrl", "midiUrl", "lyricsUrl", "abcUrl", "demoAudioUrl", "sheetPdfUrl", "stemsZipUrl"];
const DETAIL_COLS = ["year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "chordPro", "videoUrl", "parentSongId", "relationLabel", "proAnswer"];
// masters/song.json fields the songs/assets rows read, and the column each one fills
const SONG_JSON_FIELDS: Record<string, string> = {
  title: "title", writer: "writer", year: "year", themes: "themes", key: "songKey", bpm: "bpm", timeSignature: "timeSignature", meter: "meter", language: "language", scripture: "scripture", scriptureText: "scriptureText",
  license: "license", licenseVersion: "licenseVersion", licenseUrl: "licenseUrl", proAnswer: "proAnswer", certified: "certified", submittedBy: "submittedBy", status: "status", relationLabel: "relationLabel", parentSongId: "parentSongId"
};
// served masters registered as live files (song.json and lyrics.chordpro are copied but not registered:
// the publish hook writes them, and fileUrls keeps naming the pipeline chart until then)
const MASTERS = ["score.musicxml"];
const UNREGISTERED_MASTERS = ["song.json", "lyrics.chordpro"];
// generated files registered when the package has them
const DERIVATIVES = ["score.musicxml", "slides.json", "chart.chordpro", "chart.pdf", "attribution.txt", "duration.json", "cover-thumb.webp", "sources.txt"];
// a song without its own inherits these from its work — exactly the way abcUrl already resolves through works/<slug>
const WORK_INHERITED = new Set(["score.musicxml", "cover-thumb.webp"]);
const PACKAGE_SUBDIR = /\/(sources|masters|derivatives)\/.*$/;
const PACKAGE_NAME = /^.*?\/(sources|masters|derivatives)\//;
const CHORD = /\[[A-G][#b]?[^\]]*\]/;
const STANZA_LABEL = /^(verse|chorus|refrain|bridge|pre-?chorus|intro|outro|tag|ending|interlude|coda)\b/i;

interface Package { dir: string | null; workDir: string | null; song: any; body: string | null; hymnary: any; video: any; }

function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function readText(file: string): string | null {
  try { return fs.readFileSync(file, "utf8"); } catch { return null; }
}

/** Package-relative name of a repo path: "songs/en/pd/x/sources/tune.mid" → "sources/tune.mid"; a path outside the three folders is a source. */
export function packageName(repoPath: string): string {
  if (PACKAGE_NAME.test(repoPath)) return repoPath.replace(PACKAGE_NAME, "$1/");
  return `sources/${repoPath.split("/").pop() || ""}`;
}

// mirrors lib.mjs splitChordpro: directive header lines, one blank line, body verbatim, one trailing \n
export function chordproBody(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].startsWith("{")) i++;
  if (lines[i] === "") i++;
  return lines.slice(i).join("\n");
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

function readPackage(repoDir: string, row: any, index: () => Map<string, string>): Package {
  const paths: string[] = FILE_COLS.map((c) => row[c]).filter((v) => typeof v === "string" && PACKAGE_SUBDIR.test(v));
  const dir = paths.find((p) => p.startsWith("songs/"))?.replace(PACKAGE_SUBDIR, "") || index().get(row.id) || null;
  const song = dir ? readJson(path.join(repoDir, dir, "masters", "song.json")) : null;
  const workDir = paths.find((p) => p.startsWith("works/"))?.replace(PACKAGE_SUBDIR, "") || (song?.workRef ? `works/${song.workRef}` : null);
  const lyrics = dir ? readText(path.join(repoDir, dir, "masters", "lyrics.chordpro")) : null;
  return {
    dir,
    workDir,
    song,
    body: lyrics === null ? null : chordproBody(lyrics),
    hymnary: dir ? readJson(path.join(repoDir, dir, "sources", "hymnary.json")) : null,
    video: dir ? readJson(path.join(repoDir, dir, "sources", "video.json")) : null
  };
}

/** repo-relative path of a package file: the package's own, else the work's for the inheritable ones. */
function packageFile(repoDir: string, pkg: Package, folder: "masters" | "derivatives", name: string): string | null {
  const candidates = [pkg.dir, WORK_INHERITED.has(name) ? pkg.workDir : null].filter((d): d is string => !!d);
  for (const dir of candidates) {
    const rel = `${dir}/${folder}/${name}`;
    if (fs.existsSync(path.join(repoDir, rel))) return rel;
  }
  return null;
}

/** The catalog row with everything the package itself asserts laid over it. */
function songRecord(row: any, pkg: Package): any {
  const out: any = { ...row };
  for (const [field, col] of Object.entries(SONG_JSON_FIELDS)) if (pkg.song?.[field] !== undefined && pkg.song[field] !== null) out[col] = pkg.song[field];
  if (pkg.body !== null) out.chordPro = pkg.body;
  if (typeof pkg.hymnary?.hymnalCount === "number") out.hymnalCount = pkg.hymnary.hymnalCount;
  if (pkg.video?.youtube) out.videoUrl = `https://www.youtube.com/watch?v=${pkg.video.youtube}`;
  return out;
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
  const copied = new Set<string>();
  const now = new Date();
  let packageIndex: Map<string, string> | undefined;
  const index = () => (packageIndex ||= indexPackages(repoDir));

  for (const row of raw.rows) {
    const pkg = readPackage(repoDir, row, index);
    const rec = songRecord(row, pkg);
    const seen = new Set<string>();
    const copy = (from: string) => {
      const to = `assets/song/${row.id}/${packageName(from)}`;
      if (!copied.has(to)) { copied.add(to); copies.push({ from, to }); }
    };
    const addFile = (from: string) => {
      const name = packageName(from);
      const base = name.split("/").pop() || "";
      if (seen.has(base)) return; // one file per basename: the first registered wins (masters before derivatives)
      seen.add(base);
      const src = path.join(repoDir, from);
      assetFiles.push({ id: UniqueIdHelper.shortId(), assetId: row.id, submissionId: null, name, action: "add", sizeBytes: fs.existsSync(src) ? fs.statSync(src).size : null, uploadedBy: rec.submittedBy || null });
      copy(from);
    };
    for (const c of FILE_COLS) if (row[c]) addFile(row[c]);
    const served: Record<string, string | null> = {};
    let masterScore = false;
    for (const name of MASTERS) {
      const rel = packageFile(repoDir, pkg, "masters", name);
      if (rel) { addFile(rel); served[name] = rel; masterScore = masterScore || name === "score.musicxml"; }
    }
    for (const name of DERIVATIVES) {
      const rel = packageFile(repoDir, pkg, "derivatives", name);
      if (rel && !seen.has(name)) { addFile(rel); served[name] = rel; }
    }
    for (const name of UNREGISTERED_MASTERS) {
      const rel = pkg.dir ? `${pkg.dir}/masters/${name}` : null;
      if (rel && fs.existsSync(path.join(repoDir, rel))) copy(rel);
    }
    if (row.writerPortraitUrl) {
      const to = String(row.writerPortraitUrl);
      if (!copied.has(to)) { copied.add(to); copies.push({ from: to, to }); }
    }

    let authorId: string | null = null;
    if (rec.writer) {
      const key = [rec.writer, row.writerBio || "", row.writerPortraitUrl || ""].join("|");
      authorId = authorIdByKey[key];
      if (!authorId) {
        authorId = UniqueIdHelper.shortId();
        authorIdByKey[key] = authorId;
        authors.push({ id: authorId, name: rec.writer, bio: row.writerBio || null, portraitUrl: row.writerPortraitUrl ? `commons/${row.writerPortraitUrl}` : null });
      }
    }

    const pending = rec.status === "pending";
    const submissionId = UniqueIdHelper.shortId();
    const detail: Record<string, unknown> = { writer: rec.writer, certified: true };
    for (const c of DETAIL_COLS) if (rec[c] !== undefined && rec[c] !== null) detail[c] = rec[c];
    submissions.push({
      id: submissionId,
      assetId: row.id,
      submittedBy: rec.submittedBy || "seed",
      status: pending ? "pending" : "approved",
      payload: JSON.stringify({ name: rec.title, tags: rec.themes, language: rec.language, license: rec.license, detail }),
      note: "Imported",
      submittedAt: now,
      reviewedAt: pending ? null : now
    });
    assets.push({
      id: row.id,
      assetType: "song",
      name: rec.title,
      tags: rec.themes,
      language: rec.language,
      license: rec.license,
      publisherUserId: rec.submittedBy,
      status: pending ? "pending" : "published",
      publishedAt: pending ? null : now,
      publishedSubmissionId: pending ? null : submissionId,
      downloadCount: 0,
      ratingCount: 0,
      ratingSum: 0,
      featured: 0
    });
    const song: any = { assetId: row.id, authorId };
    for (const c of SONG_COLS) if (rec[c] !== undefined) song[c] = rec[c];
    Object.assign(song, packageColumns(repoDir, rec, pkg, served, masterScore));
    songs.push(song);
  }
  return { assets, songs, authors, assetFiles, submissions, copies };
}

/** The package-model columns: what song.json, duration.json and the served files say about the row. */
function packageColumns(repoDir: string, rec: any, pkg: Package, served: Record<string, string | null>, masterScore: boolean): Record<string, unknown> {
  const duration = served["duration.json"] ? readJson(path.join(repoDir, served["duration.json"])) : null;
  const seconds = Number(duration?.seconds);
  const pinned = Array.isArray(pkg.song?.pipeline?.publishedKeys) ? pkg.song.pipeline.publishedKeys : null;
  const hasChords = CHORD.test(rec.chordPro || "");
  const scoreSource = masterScore ? "master" : served["score.musicxml"] ? "abc" : null;
  const computed = masterScore ? "proofread-score" : served["score.musicxml"] ? "converted-from-abc" : hasChords ? "chart-only" : "lyrics-only";
  return {
    confidence: rec.confidence ?? computed,
    firstLine: firstLine(rec.chordPro || ""),
    hasChords,
    tune: null,
    meter: rec.meter ?? null,
    rights: pkg.song?.rights ? JSON.stringify(pkg.song.rights) : null,
    form: pkg.song?.form ? JSON.stringify(pkg.song.form) : null,
    singTimeSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null,
    scoreSource,
    publishedKeys: JSON.stringify(pinned || (rec.songKey ? [rec.songKey] : []))
  };
}
