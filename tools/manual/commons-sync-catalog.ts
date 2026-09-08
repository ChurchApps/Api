import { createKysely, ensureEnvironment } from "../kysely-config.js";
import { buildCatalog } from "../commons-seed/catalog.js";

// Incremental catalog → commons DB. Inserts missing songs/files. Never drops.
// --update also writes chordPro/metadata on existing songs and re-points live assetFiles rows whose
// basename the catalog now serves from a different key (a pre-cut-over "sources/tune.mid" row becomes
// "songs/<lang>/<section>/<slug>-<id>/sources/tune.mid"; the old id-keyed object keeps working until then).
// Bytes are never uploaded here: the bucket holds exactly the content repo's layout under commons/, pushed by
// the repo's own `node tools/sync.mjs push` (README "Sync"), and catalog.json is the index of what it holds.
// Usage:
//   COMMONS_CONNECTION_STRING=... COMMONS_CONTENT_REPO=... \
//   npx tsx tools/manual/commons-sync-catalog.ts [--dry-run] [--update]
const dry = process.argv.includes("--dry-run");
const update = process.argv.includes("--update");
const repoDir = process.env.COMMONS_CONTENT_REPO;
if (!repoDir) throw new Error("COMMONS_CONTENT_REPO is required");

const base = (name: string) => name.split("/").pop() || "";

async function main() {
  await ensureEnvironment();
  const { assets, songs, authors, assetFiles, submissions } = buildCatalog(repoDir);
  const db = createKysely("commons");
  try {
    const existingIds = new Set((await db.selectFrom("assets").select("id").execute()).map(r => r.id));
    const existingAuthors = await db.selectFrom("authors").select(["id", "name"]).execute();
    const authorIdByName = new Map(existingAuthors.map(a => [a.name as string, a.id as string]));
    const existingFiles = await db.selectFrom("assetFiles").select(["id", "assetId", "name", "sizeBytes"]).where("submissionId", "is", null).execute();
    // one live file per basename per asset, whichever layout its name is in
    const liveByBase = new Map(existingFiles.map(f => [`${f.assetId}/${base(String(f.name))}`, f]));

    const newAssets = assets.filter(a => !existingIds.has(a.id));
    const newSongs = songs.filter(s => !existingIds.has(s.assetId));
    const existingSongs = songs.filter(s => existingIds.has(s.assetId));
    const newSubs = submissions.filter(s => !existingIds.has(s.assetId));
    const newFiles: typeof assetFiles = [];
    const rekeyed: { id: string; from: string; to: string; sizeBytes: number | null }[] = [];
    for (const f of assetFiles) {
      const current = existingIds.has(f.assetId) ? liveByBase.get(`${f.assetId}/${base(f.name)}`) : undefined;
      if (!current) newFiles.push(f);
      else if (current.name !== f.name) rekeyed.push({ id: String(current.id), from: String(current.name), to: f.name, sizeBytes: f.sizeBytes });
    }
    const neededAuthorSeedIds = new Set(newSongs.map(s => s.authorId).filter(Boolean));
    const newAuthors = authors.filter(a => neededAuthorSeedIds.has(a.id) && !authorIdByName.has(a.name));

    console.log(`catalog ${assets.length} songs; db already has ${existingIds.size}`);
    console.log(`new authors ${newAuthors.length}, assets ${newAssets.length}, files ${newFiles.length}, files to re-key ${rekeyed.length}${update ? ` (will update ${existingSongs.length} songs and re-key)` : " (re-key needs --update)"}${dry ? " (dry-run)" : ""}`);

    if (dry) {
      for (const a of newAssets) console.log(`  + ${a.license} ${a.name} (${a.id})`);
      const extraFiles = newFiles.filter(f => existingIds.has(f.assetId));
      console.log(`  extra files on existing songs: ${extraFiles.length}`);
      for (const r of rekeyed.slice(0, 20)) console.log(`  ~ ${r.from} -> ${r.to}`);
      if (rekeyed.length > 20) console.log(`  ... ${rekeyed.length - 20} more`);
      if (update) console.log(`  would update chordPro/metadata on ${existingSongs.length} existing songs`);
      return;
    }

    for (const a of newAuthors) {
      await db.insertInto("authors").values(a).execute();
      authorIdByName.set(a.name, a.id);
    }
    for (const song of newSongs) {
      if (song.authorId) {
        const src = authors.find(a => a.id === song.authorId);
        if (src && authorIdByName.get(src.name)) song.authorId = authorIdByName.get(src.name);
      }
    }
    for (const row of newAssets) await db.insertInto("assets").values(row).execute();
    for (const row of newSongs) await db.insertInto("songs").values(row).execute();
    for (const row of newSubs) await db.insertInto("submissions").values(row).execute();
    for (const row of newFiles) await db.insertInto("assetFiles").values(row).execute();

    if (update) {
      const SONG_UPDATE = [
        "year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "hymnalCount", "chordPro", "videoUrl", "parentSongId", "relationLabel", "licenseVersion", "licenseUrl", "proAnswer", "certified",
        // package model (2026-09-07): catalog-derived only — the listen-gate columns are never overwritten from the repo
        "confidence", "firstLine", "hasChords", "rights", "form", "singTimeSeconds", "scoreSource", "publishedKeys"
      ] as const;
      let updated = 0;
      for (const song of existingSongs) {
        const patch: Record<string, unknown> = {};
        for (const c of SONG_UPDATE) if (song[c] !== undefined) patch[c] = song[c];
        await db.updateTable("songs").set(patch as any).where("assetId", "=", song.assetId).execute();
        updated++;
      }
      console.log(`updated ${updated} existing songs`);
      for (const r of rekeyed) await db.updateTable("assetFiles").set({ name: r.to, sizeBytes: r.sizeBytes } as any).where("id", "=", r.id).execute();
      console.log(`re-keyed ${rekeyed.length} live files to their catalog keys`);
    }
  } finally {
    await db.destroy();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
