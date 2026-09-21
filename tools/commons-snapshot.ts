import { sql } from "kysely";
import { createKysely, ensureEnvironment } from "./kysely-config.js";

// Content-hash of every catalog-managed table, so two runs can be compared without eyeballing 1263 rows.
const TABLES: Record<string, string> = {
  assets: "select id, name, tags, language, license, status, downloadCount, saveCount, featured, publisherUserId from assets order by id",
  songs: "select assetId, year, songKey, bpm, ccli, scripture, confidence, rights, hasChords, scoreSource from songs order by assetId",
  authors: "select id, name, bio, portraitUrl, links from authors order by id",
  assetFiles: "select assetId, name, submissionId from assetFiles order by assetId, name",
  submissions: "select id, assetId, status from submissions order by id"
};

async function main() {
  await ensureEnvironment();
  const db = createKysely("commons");
  try {
    for (const [table, query] of Object.entries(TABLES)) {
      const rows = (await sql.raw(query).execute(db)).rows as Record<string, unknown>[];
      const body = rows.map((r) => Object.values(r).map((v) => (v === null ? "\\N" : String(v))).join("\u0001")).join("\n");
      const { createHash } = await import("node:crypto");
      console.log(`${table}\t${rows.length}\t${createHash("sha256").update(body).digest("hex").slice(0, 16)}`);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
