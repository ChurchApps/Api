import * as fs from "fs";
import * as path from "path";

// The catalog master lives in the WorshipCommonsContent repo (catalog.json at its root).
// The commons content store mirrors that repo layout under "commons/", so url columns are
// repo-relative paths (songs/<lang>/<section>/<slug>/...) prefixed with contentRoot + /commons.
// Each catalog row becomes an assets row (the spine, keyed by the frozen song id) plus a
// songs satellite row of domain-only detail.

const URL_COLS = ["midiUrl", "lyricsUrl", "abcUrl", "artUrl", "writerPortraitUrl", "demoAudioUrl", "sheetPdfUrl", "stemsZipUrl"];

const SONG_COLS = [
  "writer",
  "year",
  "songKey",
  "bpm",
  "timeSignature",
  "scripture",
  "scriptureText",
  "hymnalCount",
  "chordPro",
  "demoAudioUrl",
  "demoAudioBytes",
  "sheetPdfUrl",
  "sheetPdfBytes",
  "stemsZipUrl",
  "stemsZipBytes",
  "midiUrl",
  "midiBytes",
  "lyricsUrl",
  "abcUrl",
  "videoUrl",
  "writerPortraitUrl",
  "writerBio",
  "parentSongId",
  "relationLabel",
  "proAnswer",
  "certified"
];

/** Directories of the content repo that are mirrored into the commons content store. */
export const MIRRORED_DIRS = ["songs", "writers", "works"];

export function buildCatalog(contentRoot: string, repoDir: string) {
  const catalogPath = path.join(repoDir, "catalog.json");
  if (!fs.existsSync(catalogPath)) throw new Error(`No catalog.json at ${repoDir} — point COMMONS_CONTENT_REPO at a WorshipCommonsContent checkout`);
  const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const prefix = `${contentRoot.replace(/\/$/, "")}/commons`;
  const assets: any[] = [];
  const songs: any[] = [];
  for (const r of raw.rows) {
    const row = { ...r };
    for (const c of URL_COLS) if (row[c]) row[c] = `${prefix}/${row[c]}`;
    assets.push({
      id: row.id,
      assetType: "song",
      name: row.title,
      tags: row.themes,
      language: row.language,
      license: row.license,
      publisherUserId: row.submittedBy,
      status: row.status || "approved",
      thumbPath: row.artUrl,
      downloadCount: 0,
      likeCount: 0,
      featured: 0
    });
    const song: any = { assetId: row.id };
    for (const c of SONG_COLS) if (row[c] !== undefined) song[c] = row[c];
    songs.push(song);
  }
  return { assets, songs };
}
