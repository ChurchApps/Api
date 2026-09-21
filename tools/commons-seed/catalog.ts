import * as fs from "fs";
import * as path from "path";
import { UniqueIdHelper } from "@churchapps/apihelper";

// The content repo (WorshipCommonsContent) is a tree of packages: songs/<lang>/<slug>-<id>/, each with
// song.json (what a person asserted), sources/ (came from somewhere else) and output/ (the pipeline built
// it: composition/ files, composition.zip, audio/ renders, audio.zip). catalog.json at its root is THE index
// of those packages; nothing discovers songs by listing folders. Packages written before 2026-09 used
// songs/<lang>/<license>/<slug>-<id>/ with masters/ and derivatives/; FOLDERS reads both.
//
// Each package becomes an assets row (the spine, keyed by the frozen song id), a songs satellite row,
// an authors row per distinct writer, one live assetFiles row per served file, and one approved
// "Imported" submission so every asset starts with a non-empty history.
//
// The song row is built from song.json + sources/lyrics.chordpro (+ sources/hymnary.json,
// sources/video.json, output/composition/duration.json); the catalog row only supplies what the package lacks
// (id, package paths, confidence, parentSongId, writer bio/portrait). Nothing is copied: the bucket holds
// exactly the repo's layout under the commons prefix (the content repo's `sync push`), so assetFiles.name is
// the catalog key itself ("songs/en/public-domain/amazing-grace-YxPfAFYWOaG/sources/tune.mid"; a translation's
// inherited file is keyed under its parent song's package) and the public URL is that key under the commons prefix.
// The works/<slug>/ package (2026-08 … 2026-09-16) is gone from the repo; readPackage still honours workDir for
// the fixture and any bucket that has not been resynced.

const SONG_COLS = [
  "year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "hymnalCount", "chordPro", "videoUrl", "parentSongId", "relationLabel", "licenseVersion", "licenseUrl", "ccli", "proAnswer", "certified", "confidence"
];
const FILE_COLS = ["artUrl", "midiUrl", "lyricsUrl", "abcUrl", "demoAudioUrl", "sheetPdfUrl", "stemsZipUrl", "previewUrl", "instrumentalUrl", "compositionZipUrl", "audioZipUrl"];
const DETAIL_COLS = ["year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "chordPro", "videoUrl", "parentSongId", "relationLabel", "proAnswer"];
// song.json fields the songs/assets rows read, and the column each one fills
const SONG_JSON_FIELDS: Record<string, string> = {
  title: "title", writer: "writer", year: "year", themes: "themes", key: "songKey", bpm: "bpm", timeSignature: "timeSignature", meter: "meter", language: "language", scripture: "scripture", scriptureText: "scriptureText",
  license: "license", licenseVersion: "licenseVersion", licenseUrl: "licenseUrl", ccli: "ccli", proAnswer: "proAnswer", certified: "certified", submittedBy: "submittedBy", status: "status", relationLabel: "relationLabel", parentSongId: "parentSongId"
};
// Where a package keeps each kind of file. The pipeline layout (2026-09) puts song.json at the package root,
// lyrics with the other inputs, and everything built under output/composition/. The pre-pipeline
// masters//derivatives/ layout is listed second so the test fixture and any un-resynced bucket still read.
const FOLDERS = {
  master: ["", "masters/"],
  lyrics: ["sources/", "masters/"],
  derivative: ["output/composition/", "derivatives/"]
} as const;

// served masters registered as live files. song.json is registered so every seeded song has a live file inside
// its own package (a publish reads the frozen package dir from it — a translation may otherwise only hold files
// inherited from its work); lyrics.chordpro is not, so fileUrls keeps naming the pipeline chart until the
// publish hook rewrites it.
const MASTERS = ["song.json", "score.musicxml"];
// generated files registered when the package has them
// score.mid is the engraving the pipeline emits when a package has no proofread score.musicxml
const DERIVATIVES = ["score.musicxml", "score.mid", "slides.json", "chart.chordpro", "chart.pdf", "attribution.txt", "duration.json", "cover-thumb.webp", "sources.txt"];
// a song without its own inherits these from its work — exactly the way abcUrl already resolves through works/<slug>
// a translation has no engraving of its own: it sings the parent song's tune, so it inherits the score
const WORK_INHERITED = new Set(["score.musicxml", "score.mid", "cover-thumb.webp"]);
// the pipeline bundles, served straight out of output/
const OUTPUT_BUNDLES = ["composition.zip", "audio.zip"];
const PACKAGE_SUBDIR = /\/(sources|masters|derivatives|output)\/.*$/;
const CHORD = /\[[A-G][#b]?[^\]]*\]/;
const STANZA_LABEL = /^(verse|chorus|refrain|bridge|pre-?chorus|intro|outro|tag|ending|interlude|coda)\b/i;

interface Package { dir: string | null; workDir: string | null; inheritDir: string | null; song: any; body: string | null; hymnary: any; video: any; }

function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function readText(file: string): string | null {
  try { return fs.readFileSync(file, "utf8"); } catch { return null; }
}

/** Same slug rule as WorshipCommonsContent tools/lib.mjs slugify. */
export function writerFolderSlugs(name: string): string[] {
  const slug = (s: string) => s.normalize("NFC").toLowerCase()
    .replace(/['’ʼ]/gu, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const people = name.split(/\s*[·/&,]|\s+and\s+/i)
    .map(s => s.replace(/^\s*(tr\.|attr\.?|after|from)\s+/i, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [...new Set([slug(name), ...people.map(slug)].filter(Boolean))];
}

function loadWriterProfiles(repoDir: string): Map<string, any> {
  const dir = path.join(repoDir, "writers");
  const map = new Map<string, any>();
  if (!fs.existsSync(dir)) return map;
  for (const slug of fs.readdirSync(dir)) {
    const w = readJson(path.join(dir, slug, "writer.json"));
    if (!w) continue;
    map.set(w.slug || slug, w);
    if (typeof w.name === "string" && w.name.trim()) map.set(w.name.trim(), w);
  }
  return map;
}

const LINKS_MAX = 5;

export function authorLinksJson(name: string, repoDir: string): string | null {
  return encodedAuthorLinks(name, loadWriterProfiles(repoDir));
}

function encodedAuthorLinks(name: string, profiles: Map<string, any>): string | null {
  const hits = new Set<any>();
  const exact = profiles.get(name);
  if (exact) hits.add(exact);
  for (const slug of writerFolderSlugs(name)) {
    const w = profiles.get(slug);
    if (w) hits.add(w);
  }
  const seen = new Set<string>();
  const stored: { label: string; url: string; support?: boolean }[] = [];
  const add = (list: any[] | undefined, support: boolean) => {
    for (const raw of list || []) {
      const url = String(raw?.url || "").trim();
      if (!url || !/^https?:\/\/\S+$/i.test(url)) continue;
      const kind = support ? stored.filter(l => l.support).length : stored.filter(l => !l.support).length;
      if (kind >= LINKS_MAX) return;
      const key = `${support ? "s" : "l"}|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const row: { label: string; url: string; support?: boolean } = { label: String(raw?.label || "").trim().slice(0, 60), url: url.slice(0, 255) };
      if (support) row.support = true;
      stored.push(row);
    }
  };
  for (const w of hits) {
    add(w.links, false);
    add(w.supportLinks, true);
  }
  return stored.length ? JSON.stringify(stored) : null;
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

/**
 * id → package dir. The pipeline layout is songs/<lang>/<slug>-<id>/; the pre-2026-09 one put a <license>
 * section in between, so both depths are walked and whichever level holds a song.json wins.
 */
function indexPackages(repoDir: string): Map<string, string> {
  const index = new Map<string, string>();
  const songsDir = path.join(repoDir, "songs");
  if (!fs.existsSync(songsDir)) return index;
  const dirs = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
  const claim = (rel: string) => {
    const id = readJson(path.join(repoDir, rel, "song.json"))?.id ?? readJson(path.join(repoDir, rel, "masters", "song.json"))?.id;
    if (id) index.set(id, rel);
    return !!id;
  };
  for (const lang of dirs(songsDir)) {
    for (const slug of dirs(path.join(songsDir, lang))) {
      const rel = ["songs", lang, slug].join("/");
      if (claim(rel)) continue;
      for (const inner of dirs(path.join(songsDir, lang, slug))) claim([rel, inner].join("/"));
    }
  }
  return index;
}

function readPackage(repoDir: string, row: any, index: () => Map<string, string>): Package {
  const paths: string[] = FILE_COLS.map((c) => row[c]).filter((v) => typeof v === "string" && PACKAGE_SUBDIR.test(v));
  // The index wins: it maps id -> the package whose song.json claims that id. A translation's file columns
  // point into its parent's package for the files it inherits, so trusting a path here reads the parent's
  // song.json and overwrites the translation's own title, language and writer.
  const dir = index().get(row.id) || paths.find((p) => p.startsWith("songs/"))?.replace(PACKAGE_SUBDIR, "") || null;
  const song = dir ? firstJson(repoDir, dir, FOLDERS.master, "song.json") : null;
  const workDir = paths.find((p) => p.startsWith("works/"))?.replace(PACKAGE_SUBDIR, "") || (song?.workRef ? `works/${song.workRef}` : null);
  // works/ is gone; a translation inherits from the package its parentSongId names
  const parentId = song?.parent?.id || song?.parentSongId || row.parentSongId;
  const inheritDir = parentId ? index().get(parentId) || null : null;
  const lyricsRel = dir ? firstPath(repoDir, dir, FOLDERS.lyrics, "lyrics.chordpro") : null;
  const lyrics = lyricsRel ? readText(path.join(repoDir, lyricsRel)) : null;
  return {
    dir,
    workDir,
    inheritDir,
    song,
    body: lyrics === null ? null : chordproBody(lyrics),
    hymnary: dir ? readJson(path.join(repoDir, dir, "sources", "hymnary.json")) : null,
    video: dir ? readJson(path.join(repoDir, dir, "sources", "video.json")) : null
  };
}

const firstPath = (repoDir: string, dir: string, prefixes: readonly string[], name: string) =>
  prefixes.map((p) => `${dir}/${p}${name}`).find((rel) => fs.existsSync(path.join(repoDir, rel))) || null;

const firstJson = (repoDir: string, dir: string, prefixes: readonly string[], name: string) => {
  const rel = firstPath(repoDir, dir, prefixes, name);
  return rel ? readJson(path.join(repoDir, rel)) : null;
};

/** repo-relative path of a package file: the package's own, else the work's for the inheritable ones. */
function packageFile(repoDir: string, pkg: Package, folder: keyof typeof FOLDERS, name: string): string | null {
  const inherited = WORK_INHERITED.has(name) ? [pkg.workDir, pkg.inheritDir] : [];
  const candidates = [pkg.dir, ...inherited].filter((d): d is string => !!d);
  for (const dir of candidates) {
    const rel = firstPath(repoDir, dir, FOLDERS[folder], name);
    if (rel) return rel;
  }
  return null;
}

/**
 * Files in a package subfolder whose names the pipeline chooses (output/audio holds title-BPM mixes).
 * A translation with no renders of its own falls back to the parent's: it sings the same tune, so the
 * instrumental, preview and stems apply to it too.
 */
function packageDirFiles(repoDir: string, pkg: Package, sub: string): string[] {
  for (const dir of [pkg.dir, pkg.inheritDir].filter((d): d is string => !!d)) {
    const abs = path.join(repoDir, dir, sub);
    if (!fs.existsSync(abs)) continue;
    const files = fs.readdirSync(abs, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => `${dir}/${sub}/${e.name}`);
    if (files.length) return files;
  }
  return [];
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
  const writerProfiles = loadWriterProfiles(repoDir);
  const now = new Date();
  let packageIndex: Map<string, string> | undefined;
  const index = () => (packageIndex ||= indexPackages(repoDir));

  for (const row of raw.rows) {
    const pkg = readPackage(repoDir, row, index);
    const rec = songRecord(row, pkg);
    const seen = new Set<string>();
    // name = the catalog key, verbatim (forward slashes; the repo path is the bucket key)
    const addFile = (key: string) => {
      const name = key.replace(/\\/g, "/");
      const base = name.split("/").pop() || "";
      // 255 is assetFiles.name after 2026-09-08; the old varchar(100) silently truncated long slugs
      if (!name || name.length > 255 || seen.has(base)) return; // one file per basename: the first registered wins (masters before derivatives)
      seen.add(base);
      const src = path.join(repoDir, name);
      assetFiles.push({ id: UniqueIdHelper.shortId(), assetId: row.id, submissionId: null, name, action: "add", sizeBytes: fs.existsSync(src) ? fs.statSync(src).size : null, uploadedBy: rec.submittedBy || null });
    };
    for (const c of FILE_COLS) if (row[c]) addFile(row[c]);
    for (const extra of row.extraUrls || []) if (typeof extra === "string") addFile(extra);
    const served: Record<string, string | null> = {};
    let masterScore = false;
    for (const name of MASTERS) {
      const rel = packageFile(repoDir, pkg, "master", name);
      if (rel) { addFile(rel); served[name] = rel; masterScore = masterScore || name === "score.musicxml"; }
    }
    for (const name of DERIVATIVES) {
      const rel = packageFile(repoDir, pkg, "derivative", name);
      if (rel && !seen.has(name)) { addFile(rel); served[name] = rel; }
    }
    // the pipeline's bundles and audio renders: fixed-name zips, plus output/audio/ whose mixes are title-named
    for (const name of OUTPUT_BUNDLES) {
      const rel = pkg.dir ? firstPath(repoDir, pkg.dir, [""], `output/${name}`) : null;
      if (rel) { addFile(rel); served[name] = rel; }
    }
    for (const rel of packageDirFiles(repoDir, pkg, "output/audio")) addFile(rel);

    let authorId: string | null = null;
    if (rec.writer) {
      const key = [rec.writer, row.writerBio || "", row.writerPortraitUrl || ""].join("|");
      authorId = authorIdByKey[key];
      if (!authorId) {
        authorId = UniqueIdHelper.shortId();
        authorIdByKey[key] = authorId;
        authors.push({ id: authorId, name: rec.writer, bio: row.writerBio || null, portraitUrl: row.writerPortraitUrl ? `commons/${row.writerPortraitUrl}` : null, links: encodedAuthorLinks(rec.writer, writerProfiles) });
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
      saveCount: 0,
      ratingCount: 0,
      ratingSum: 0,
      featured: 0
    });
    const song: any = { assetId: row.id, authorId };
    for (const c of SONG_COLS) if (rec[c] !== undefined) song[c] = rec[c];
    Object.assign(song, packageColumns(repoDir, rec, pkg, served, masterScore));
    songs.push(song);
  }
  return { assets, songs, authors, assetFiles, submissions };
}

/** The package-model columns: what song.json, duration.json and the served files say about the row. */
function packageColumns(repoDir: string, rec: any, pkg: Package, served: Record<string, string | null>, masterScore: boolean): Record<string, unknown> {
  const duration = served["duration.json"] ? readJson(path.join(repoDir, served["duration.json"])) : null;
  const seconds = Number(duration?.seconds);
  const pinned = Array.isArray(pkg.song?.pipeline?.publishedKeys) ? pkg.song.pipeline.publishedKeys : null;
  const hasChords = CHORD.test(rec.chordPro || "");
  const scoreSource = masterScore ? "master" : served["score.musicxml"] ? "abc" : null;
  const computed = served["score.musicxml"] ? "score" : hasChords ? "chart-only" : "lyrics-only";
  const stored = rec.confidence ?? computed;
  return {
    confidence: stored === "proofread-score" || stored === "converted-from-abc" ? "score" : stored,
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
