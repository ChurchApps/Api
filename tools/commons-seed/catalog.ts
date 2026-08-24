import * as fs from "fs";
import * as path from "path";
import { UniqueIdHelper } from "@churchapps/apihelper";

// The catalog master lives in the WorshipCommonsContent repo (catalog.json at its root).
// The commons content store mirrors that repo layout under "commons/", so each row becomes
// an assets row (the spine, keyed by the frozen song id) with path = its repo folder and
// files = the media file names inside it, an authors row per distinct writer, and a songs
// satellite row of domain-only detail. Files the catalog resolves from shared works/ or
// writers/ folders are copied into the song folder ("copies") so path+files stays one shape.

const SONG_COLS = ["year", "songKey", "bpm", "timeSignature", "scripture", "scriptureText", "hymnalCount", "chordPro", "videoUrl", "parentSongId", "relationLabel", "proAnswer", "certified"];
const FILE_COLS = ["artUrl", "midiUrl", "lyricsUrl", "abcUrl", "demoAudioUrl", "sheetPdfUrl", "stemsZipUrl"];

/** Directories of the content repo that are mirrored into the commons content store. */
export const MIRRORED_DIRS = ["songs", "writers", "works"];

function mapSongFolders(repoDir: string): Record<string, string> {
  const folderById: Record<string, string> = {};
  const songsDir = path.join(repoDir, "songs");
  if (!fs.existsSync(songsDir)) return folderById;
  for (const lang of fs.readdirSync(songsDir)) {
    const langDir = path.join(songsDir, lang);
    if (!fs.statSync(langDir).isDirectory()) continue;
    for (const section of fs.readdirSync(langDir)) {
      const sectionDir = path.join(langDir, section);
      if (!fs.statSync(sectionDir).isDirectory()) continue;
      for (const folder of fs.readdirSync(sectionDir)) {
        const jsonPath = path.join(sectionDir, folder, "song.json");
        if (!fs.existsSync(jsonPath)) continue;
        const id = JSON.parse(fs.readFileSync(jsonPath, "utf8")).id;
        if (id) folderById[id] = `songs/${lang}/${section}/${folder}`;
      }
    }
  }
  return folderById;
}

export function buildCatalog(repoDir: string) {
  const catalogPath = path.join(repoDir, "catalog.json");
  if (!fs.existsSync(catalogPath)) throw new Error(`No catalog.json at ${repoDir} — point COMMONS_CONTENT_REPO at a WorshipCommonsContent checkout`);
  const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const folderById = mapSongFolders(repoDir);

  const assets: any[] = [];
  const songs: any[] = [];
  const authors: any[] = [];
  const authorIdByKey: Record<string, string> = {};
  const copies: { from: string; to: string }[] = [];

  for (const row of raw.rows) {
    const folder = folderById[row.id];
    if (!folder) throw new Error(`No songs/ folder found for catalog row ${row.id} (${row.title})`);

    const files: string[] = [];
    for (const c of FILE_COLS) {
      const v = row[c];
      if (!v) continue;
      const base = v.split("/").pop();
      if (files.includes(base)) continue;
      files.push(base);
      if (!v.startsWith(`${folder}/`)) copies.push({ from: v, to: `${folder}/${base}` });
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

    assets.push({
      id: row.id,
      assetType: "song",
      name: row.title,
      tags: row.themes,
      language: row.language,
      license: row.license,
      publisherUserId: row.submittedBy,
      status: row.status || "approved",
      path: `commons/${folder}`,
      files: files.join(",") || null,
      downloadCount: 0,
      likeCount: 0,
      featured: 0
    });
    const song: any = { assetId: row.id, authorId };
    for (const c of SONG_COLS) if (row[c] !== undefined) song[c] = row[c];
    songs.push(song);
  }
  return { assets, songs, authors, copies };
}
