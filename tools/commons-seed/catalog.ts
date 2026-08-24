import * as fs from "fs";
import * as path from "path";

// The catalog master lives in the WorshipCommonsContent repo (catalog.json at its root).
// The commons content store mirrors that repo layout under "commons/", so url columns are
// repo-relative paths (songs/<lang>/<section>/<slug>/...) prefixed with contentRoot + /commons.

const URL_COLS = ["midiUrl", "lyricsUrl", "abcUrl", "artUrl", "writerPortraitUrl", "demoAudioUrl", "sheetPdfUrl", "stemsZipUrl"];

/** Directories of the content repo that are mirrored into the commons content store. */
export const MIRRORED_DIRS = ["songs", "writers", "works"];

export function buildCatalog(contentRoot: string, repoDir: string) {
  const catalogPath = path.join(repoDir, "catalog.json");
  if (!fs.existsSync(catalogPath)) throw new Error(`No catalog.json at ${repoDir} — point COMMONS_CONTENT_REPO at a WorshipCommonsContent checkout`);
  const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const prefix = `${contentRoot.replace(/\/$/, "")}/commons`;
  const rows = raw.rows.map((r: any) => {
    const row = { ...r };
    for (const c of URL_COLS) if (row[c]) row[c] = `${prefix}/${row[c]}`;
    return row;
  });
  return { rows: rows as any[] };
}
