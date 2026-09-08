import * as fs from "fs";
import * as path from "path";
import { PutObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { createKysely, ensureEnvironment } from "../kysely-config.js";
import { buildCatalog } from "../commons-seed/catalog.js";

// Incremental catalog → commons DB + S3. Inserts missing songs/files. Never drops.
// --update also writes chordPro/metadata on existing songs and overwrites S3 objects
// whose size changed (tiled MIDI, new timings, edited charts).
// Usage:
//   COMMONS_CONNECTION_STRING=... COMMONS_CONTENT_REPO=... AWS_S3_BUCKET=churchapps-content \
//   npx tsx tools/manual/commons-sync-catalog.ts [--dry-run] [--update]
const dry = process.argv.includes("--dry-run");
const update = process.argv.includes("--update");
const repoDir = process.env.COMMONS_CONTENT_REPO;
const bucket = process.env.AWS_S3_BUCKET;
if (!repoDir) throw new Error("COMMONS_CONTENT_REPO is required");
if (!bucket && !dry) throw new Error("AWS_S3_BUCKET is required unless --dry-run");

const s3 = new S3Client({});
const contentType = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "mid" || ext === "midi") return "audio/midi";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "json") return "application/json";
  if (ext === "abc" || ext === "chordpro" || ext === "txt") return "text/plain; charset=utf-8";
  if (ext === "musicxml" || ext === "xml") return "application/vnd.recordare.musicxml+xml";
  return "application/octet-stream";
};

async function s3Head(key: string) {
  try { return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); } catch { return null; }
}

async function main() {
  await ensureEnvironment();
  const { assets, songs, authors, assetFiles, submissions, copies } = buildCatalog(repoDir);
  const db = createKysely("commons");
  try {
    const existingIds = new Set((await db.selectFrom("assets").select("id").execute()).map(r => r.id));
    const existingAuthors = await db.selectFrom("authors").select(["id", "name"]).execute();
    const authorIdByName = new Map(existingAuthors.map(a => [a.name as string, a.id as string]));
    const existingFiles = await db.selectFrom("assetFiles").select(["assetId", "name"]).where("submissionId", "is", null).execute();
    const fileKey = new Set(existingFiles.map(f => `${f.assetId}/${f.name}`));

    const newAssets = assets.filter(a => !existingIds.has(a.id));
    const newSongs = songs.filter(s => !existingIds.has(s.assetId));
    const existingSongs = songs.filter(s => existingIds.has(s.assetId));
    const newSubs = submissions.filter(s => !existingIds.has(s.assetId));
    const newFiles = assetFiles.filter(f => !existingIds.has(f.assetId) || !fileKey.has(`${f.assetId}/${f.name}`));
    const neededAuthorSeedIds = new Set(newSongs.map(s => s.authorId).filter(Boolean));
    const newAuthors = authors.filter(a => neededAuthorSeedIds.has(a.id) && !authorIdByName.has(a.name));

    console.log(`catalog ${assets.length} songs; db already has ${existingIds.size}`);
    console.log(`new authors ${newAuthors.length}, assets ${newAssets.length}, files ${newFiles.length}${update ? `, update ${existingSongs.length}` : ""}${dry ? " (dry-run)" : ""}`);

    if (dry) {
      for (const a of newAssets) console.log(`  + ${a.license} ${a.name} (${a.id})`);
      const extraFiles = newFiles.filter(f => existingIds.has(f.assetId));
      console.log(`  extra files on existing songs: ${extraFiles.length}`);
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
    }

    let uploaded = 0, skipped = 0;
    for (const c of copies) {
      const from = path.join(repoDir, c.from);
      if (!fs.existsSync(from)) continue;
      const key = `commons/${c.to.replace(/\\/g, "/")}`;
      const head = await s3Head(key);
      const size = fs.statSync(from).size;
      if (head && (!update || head.ContentLength === size)) { skipped++; continue; }
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fs.readFileSync(from),
        ContentType: contentType(path.basename(c.to)),
        CacheControl: "public, max-age=31536000"
      }));
      uploaded++;
    }
    console.log(`uploaded ${uploaded} objects, ${skipped} already in s3://${bucket}`);
  } finally {
    await db.destroy();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
