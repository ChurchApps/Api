import * as fs from "fs";
import * as path from "path";
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createKysely, ensureEnvironment } from "../kysely-config.js";
import { planAssetFiles, planSongFiles, type FileOp } from "../migrations/commons/2026-08-25_asset_paths_authors.js";

// Renames stored commons objects to the conventional file names the 2026-08-25 migration
// records in assets.files. Run BEFORE that migration (it reads the old url columns).
// Idempotent: skips ops whose source is gone or destination already exists.
// Usage: npx tsx tools/manual/commons-relocate-files.ts [--dry-run]

const dryRun = process.argv.includes("--dry-run");
const CONTENT_DIR = path.resolve("content");

async function collectOps(): Promise<FileOp[]> {
  const db = createKysely("commons");
  try {
    const ops: FileOp[] = [];
    const songRows = await db.selectFrom("songs").innerJoin("assets", "assets.id", "songs.assetId")
      .select(["assets.id as id", "assets.status as status", "assets.name as title", "assets.language as language",
        "assets.license as license", "assets.thumbPath as thumbPath", "songs.demoAudioUrl", "songs.sheetPdfUrl",
        "songs.stemsZipUrl", "songs.midiUrl", "songs.abcUrl", "songs.lyricsUrl"]).execute();
    for (const row of songRows) ops.push(...planSongFiles(row).ops);
    const assetRows = await db.selectFrom("assets").select(["id", "contentPath", "thumbPath"]).where("assetType", "!=", "song").execute();
    for (const row of assetRows) ops.push(...(planAssetFiles(row)?.ops || []));
    return ops;
  } finally {
    await db.destroy();
  }
}

async function applyS3(ops: FileOp[]) {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("S3 file store but no AWS_S3_BUCKET env var set");
  const s3 = new S3Client(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {});
  const exists = async (key: string) => {
    try { await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return true; } catch { return false; }
  };
  for (const op of ops) {
    if (await exists(op.to)) { console.log(`skip (exists): ${op.to}`); continue; }
    if (!(await exists(op.from))) { console.log(`skip (missing): ${op.from}`); continue; }
    console.log(`${op.copyOnly ? "copy" : "move"}: ${op.from} -> ${op.to}`);
    if (dryRun) continue;
    await s3.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${encodeURIComponent(op.from).replace(/%2F/g, "/")}`, Key: op.to }));
    if (!op.copyOnly) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: op.from }));
  }
}

function applyDisk(ops: FileOp[]) {
  for (const op of ops) {
    const from = path.join(CONTENT_DIR, op.from);
    const to = path.join(CONTENT_DIR, op.to);
    if (fs.existsSync(to)) { console.log(`skip (exists): ${op.to}`); continue; }
    if (!fs.existsSync(from)) { console.log(`skip (missing): ${op.from}`); continue; }
    console.log(`${op.copyOnly ? "copy" : "move"}: ${op.from} -> ${op.to}`);
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (op.copyOnly) fs.copyFileSync(from, to);
    else fs.renameSync(from, to);
  }
}

async function main() {
  await ensureEnvironment();
  const ops = await collectOps();
  console.log(`${ops.length} file ops${dryRun ? " (dry run)" : ""}`);
  if ((process.env.FILE_STORE || "").toUpperCase() === "S3") await applyS3(ops);
  else applyDisk(ops);
  console.log("Done.");
}

main().catch((err) => {
  console.error("commons-relocate-files failed:", err);
  process.exit(1);
});
