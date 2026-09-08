import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { createKysely, ensureEnvironment } from "../kysely-config.js";
import { FLAT_MIRROR_PREFIXES, selectPruneKeys } from "../commons-seed/prune.js";

// Deletes the stale flat mirror (commons/songs/, commons/works/, commons/writers/) from the configured S3 bucket
// once the package layout under commons/assets/song/<id>/ is live. Writer portraits that authors.portraitUrl
// still references are kept. Dry run by default: lists what would go and what stays.
// Usage:
//   COMMONS_CONNECTION_STRING=... AWS_S3_BUCKET=churchapps-content npx tsx tools/manual/commons-prune-flat-mirror.ts [--apply]
const apply = process.argv.includes("--apply");
const bucket = process.env.AWS_S3_BUCKET;
if (!bucket) throw new Error("AWS_S3_BUCKET is required");

const s3 = new S3Client({});

async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const item of page.Contents || []) if (item.Key) keys.push(item.Key);
    token = page.NextContinuationToken;
  } while (token);
  return keys;
}

async function main() {
  await ensureEnvironment();
  const db = createKysely("commons");
  let portraits: (string | null)[];
  try {
    portraits = (await db.selectFrom("authors").select("portraitUrl").where("portraitUrl", "is not", null).execute()).map((r) => r.portraitUrl as string | null);
  } finally {
    await db.destroy();
  }
  const keys: string[] = [];
  for (const prefix of FLAT_MIRROR_PREFIXES) keys.push(...(await listKeys(prefix)));
  const plan = selectPruneKeys(keys, portraits);
  console.log(`s3://${bucket}: ${keys.length} objects under ${FLAT_MIRROR_PREFIXES.join(", ")}`);
  console.log(`  keep ${plan.kept.length} (portraits referenced by authors.portraitUrl), delete ${plan.prune.length}${apply ? "" : " (dry run — pass --apply to delete)"}`);
  for (const key of plan.prune) console.log(`  - ${key}`);
  if (!apply) return;
  for (let i = 0; i < plan.prune.length; i += 1000) {
    const batch = plan.prune.slice(i, i + 1000);
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
    console.log(`deleted ${Math.min(i + 1000, plan.prune.length)} / ${plan.prune.length}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
