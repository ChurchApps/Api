import * as fs from "fs";
import * as path from "path";
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createKysely, ensureEnvironment } from "../kysely-config.js";

// Moves every stored commons object from the slug layout (commons/songs/{lang}/{section}/{slug}--{id}/
// and commons/pending/assets/{id}/) to the id layout commons/assets/{assetType}/{assetId}/{name} the
// 2026-08-26 migration assumes, and exports pending abcSubmissions text to commons/pending/{id}/tune.abc.
// Run BEFORE that migration (it reads assets.path + assets.files, which the migration drops).
// Idempotent: skips ops whose source is gone or destination already exists. Objects the DB does
// not reference are reported, never deleted.
// Usage: npx tsx tools/manual/commons-relocate-to-id-paths.ts [--dry-run] [--verify]

const dryRun = process.argv.includes("--dry-run");
const verify = process.argv.includes("--verify");
const CONTENT_DIR = path.resolve("content");

interface FileOp { from: string; to: string; }
interface TextOp { key: string; text: string; }

async function collect(): Promise<{ ops: FileOp[]; texts: TextOp[]; referenced: Set<string> }> {
  const db = createKysely("commons");
  try {
    const ops: FileOp[] = [];
    const referenced = new Set<string>();
    const rows = await db.selectFrom("assets").select(["id", "assetType", "status", "path", "files"]).execute();
    for (const r of rows) {
      const names = String(r.files || "").split(",").map((n) => n.trim()).filter(Boolean);
      const target = r.status === "pending" ? null : `commons/assets/${r.assetType}/${r.id}`;
      for (const name of names) {
        const from = `${r.path}/${name}`;
        referenced.add(from);
        if (!target) continue;
        const to = `${target}/${name}`;
        referenced.add(to);
        if (from !== to) ops.push({ from, to });
      }
    }
    const texts: TextOp[] = [];
    const abc = await db.selectFrom("abcSubmissions").select(["id", "abc"]).where("status", "=", "pending").execute();
    for (const a of abc) texts.push({ key: `commons/pending/${a.id}/tune.abc`, text: a.abc || "" });
    return { ops, texts, referenced };
  } finally {
    await db.destroy();
  }
}

async function applyS3(ops: FileOp[], texts: TextOp[], referenced: Set<string>) {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("S3 file store but no AWS_S3_BUCKET env var set");
  const s3 = new S3Client(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {});
  const exists = async (key: string) => {
    try { await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return true; } catch { return false; }
  };
  for (const op of ops) {
    if (await exists(op.to)) { console.log(`skip (exists): ${op.to}`); continue; }
    if (!(await exists(op.from))) { console.log(`skip (missing): ${op.from}`); continue; }
    console.log(`move: ${op.from} -> ${op.to}`);
    if (dryRun) continue;
    await s3.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${encodeURIComponent(op.from).replace(/%2F/g, "/")}`, Key: op.to }));
    if (!(await exists(op.to))) throw new Error(`copy did not land: ${op.to}`);
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: op.from }));
  }
  for (const t of texts) {
    if (await exists(t.key)) { console.log(`skip (exists): ${t.key}`); continue; }
    console.log(`write: ${t.key}`);
    if (!dryRun) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: t.key, Body: Buffer.from(t.text), ACL: "private", ContentType: "text/plain; charset=utf-8" }));
  }
  if (verify) {
    let token: string | undefined;
    const orphans: string[] = [];
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "commons/", ContinuationToken: token }));
      for (const o of page.Contents || []) if (o.Key && !referenced.has(o.Key) && !o.Key.startsWith("commons/writers/") && !o.Key.startsWith("commons/works/") && !o.Key.startsWith("commons/pending/")) orphans.push(o.Key);
      token = page.NextContinuationToken;
    } while (token);
    console.log(`${orphans.length} unreferenced objects left in place`);
    orphans.forEach((k) => console.log(`  orphan: ${k}`));
  }
}

function applyDisk(ops: FileOp[], texts: TextOp[], referenced: Set<string>) {
  for (const op of ops) {
    const from = path.join(CONTENT_DIR, op.from);
    const to = path.join(CONTENT_DIR, op.to);
    if (fs.existsSync(to)) { console.log(`skip (exists): ${op.to}`); continue; }
    if (!fs.existsSync(from)) { console.log(`skip (missing): ${op.from}`); continue; }
    console.log(`move: ${op.from} -> ${op.to}`);
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
  }
  for (const t of texts) {
    const file = path.join(CONTENT_DIR, t.key);
    if (fs.existsSync(file)) { console.log(`skip (exists): ${t.key}`); continue; }
    console.log(`write: ${t.key}`);
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, t.text);
  }
  if (verify) {
    const walk = (dir: string): string[] => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [];
    const orphans = walk(path.join(CONTENT_DIR, "commons", "songs")).map((f) => path.relative(CONTENT_DIR, f).replace(/\\/g, "/")).filter((k) => !referenced.has(k));
    console.log(`${orphans.length} unreferenced files left in place`);
    orphans.forEach((k) => console.log(`  orphan: ${k}`));
  }
}

async function main() {
  await ensureEnvironment();
  const { ops, texts, referenced } = await collect();
  console.log(`${ops.length} moves, ${texts.length} pending abc exports${dryRun ? " (dry run)" : ""}`);
  if ((process.env.FILE_STORE || "").toUpperCase() === "S3") await applyS3(ops, texts, referenced);
  else applyDisk(ops, texts, referenced);
  console.log("Done.");
}

main().catch((err) => {
  console.error("commons-relocate-to-id-paths failed:", err);
  process.exit(1);
});
