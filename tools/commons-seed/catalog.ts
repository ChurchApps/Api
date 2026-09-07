import * as fs from "fs";
import * as path from "path";
import { UniqueIdHelper } from "@churchapps/apihelper";

// The catalog master lives in the WorshipCommonsContent repo (catalog.json at its root).
// Each row becomes an assets row (the spine, keyed by the frozen song id), a songs satellite
// row, an authors row per distinct writer, one live assetFiles row per media file, and one
// approved "Imported" submission so every asset starts with a non-empty history. Media is
// copied into the id-keyed live folder commons/assets/song/{id}/{name} ("copies").

const SONG_COLS = ["year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "hymnalCount", "chordPro", "videoUrl", "parentSongId", "relationLabel", "licenseVersion", "licenseUrl", "proAnswer", "certified"];
const FILE_COLS = ["artUrl", "midiUrl", "lyricsUrl", "abcUrl", "demoAudioUrl", "sheetPdfUrl", "stemsZipUrl"];
const DETAIL_COLS = ["year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "chordPro", "videoUrl", "parentSongId", "relationLabel", "proAnswer"];

/** Directories of the content repo that are mirrored as-is into the commons content store. */
export const MIRRORED_DIRS = ["writers"];

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

  for (const row of raw.rows) {
    const seen = new Set<string>();
    for (const c of FILE_COLS) {
      const v = row[c];
      if (!v) continue;
      const base = v.split("/").pop();
      if (seen.has(base)) continue;
      seen.add(base);
      const src = path.join(repoDir, v);
      assetFiles.push({ id: UniqueIdHelper.shortId(), assetId: row.id, submissionId: null, name: base, action: "add", sizeBytes: fs.existsSync(src) ? fs.statSync(src).size : null, uploadedBy: row.submittedBy || null });
      copies.push({ from: v, to: `assets/song/${row.id}/${base}` });
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
    songs.push(song);
  }
  return { assets, songs, authors, assetFiles, submissions, copies };
}
