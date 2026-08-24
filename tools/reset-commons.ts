import * as fs from "fs";
import * as path from "path";
import mysql from "mysql2/promise";
import { fileURLToPath, pathToFileURL } from "url";
import { Migrator, type Migration, type MigrationProvider } from "kysely";
import { DatabaseUrlParser } from "../src/shared/helpers/DatabaseUrlParser.js";
import { createKysely, ensureEnvironment } from "./kysely-config.js";
import { buildCatalog, MIRRORED_DIRS } from "./commons-seed/catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWED_HOSTS = ["localhost", "127.0.0.1"] as const;
const CONTENT_DIR = path.resolve("content", "commons");

function refuse(message: string): never {
  console.error("\n========================================");
  console.error("reset-commons refused to run.");
  console.error(message);
  console.error("========================================\n");
  process.exit(1);
}

// Kysely's built-in provider fails on Windows with raw OS paths; we convert to file:// URLs.
class FileURLMigrationProvider implements MigrationProvider {
  constructor(private readonly folder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const result: Record<string, Migration> = {};
    for (const fileName of await fs.promises.readdir(this.folder)) {
      if (!/\.(js|ts|mjs|cjs)$/.test(fileName)) continue;
      const mod = await import(pathToFileURL(path.resolve(this.folder, fileName)).href);
      result[fileName.replace(/\.(js|ts|mjs|cjs)$/, "")] = mod as Migration;
    }
    return result;
  }
}

// Drops tables rather than the schema so a running Api's pooled connections stay valid across a reseed.
async function recreateDatabase(config: { host: string; port: number; user: string; password: string; database: string }) {
  const connection = await mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: config.password });
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` DEFAULT CHARACTER SET utf8mb4`);
    const [rows] = await connection.query(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?`, [config.database]);
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    for (const row of rows as { t: string }[]) {
      await connection.query(`DROP TABLE IF EXISTS \`${config.database}\`.\`${row.t}\``);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    await connection.end();
  }
}

async function migrate() {
  const db = createKysely("commons");
  try {
    const migrator = new Migrator({ db, provider: new FileURLMigrationProvider(path.join(__dirname, "migrations", "commons")) });
    const { error, results } = await migrator.migrateToLatest();
    results?.forEach((r) => console.log(`  ${r.status === "Success" ? "Applied" : "Failed"}: ${r.migrationName}`));
    if (error) throw error;
  } finally {
    await db.destroy();
  }
}

async function seed(repoDir: string) {
  const { assets, songs, authors, assetFiles, submissions, copies } = buildCatalog(repoDir);
  const db = createKysely("commons");
  try {
    for (const row of authors) await db.insertInto("authors").values(row).execute();
    for (const row of assets) await db.insertInto("assets").values(row).execute();
    for (const row of songs) await db.insertInto("songs").values(row).execute();
    for (const row of submissions) await db.insertInto("submissions").values(row).execute();
    for (const row of assetFiles) await db.insertInto("assetFiles").values(row).execute();
  } finally {
    await db.destroy();
  }

  if ((process.env.FILE_STORE || "").toUpperCase() !== "S3") {
    for (const dir of [...MIRRORED_DIRS, "songs", "works", "assets", "pending"]) fs.rmSync(path.join(CONTENT_DIR, dir), { recursive: true, force: true });
    for (const dir of MIRRORED_DIRS) {
      const src = path.join(repoDir, dir);
      if (fs.existsSync(src)) fs.cpSync(src, path.join(CONTENT_DIR, dir), { recursive: true });
    }
    // every media file lands in its asset's id-keyed live folder, whatever repo folder it came from
    let copied = 0;
    for (const c of copies) {
      const from = path.join(repoDir, c.from);
      const to = path.join(CONTENT_DIR, c.to);
      if (!fs.existsSync(from)) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      copied++;
    }
    console.log(`  Mirrored ${MIRRORED_DIRS.join(", ")} and copied ${copied} song files into ${CONTENT_DIR}/assets`);
  }
  console.log(`Seeded ${songs.length} songs, ${authors.length} authors, ${assetFiles.length} files.`);
}

async function main() {
  await ensureEnvironment();

  const connString = process.env.COMMONS_CONNECTION_STRING;
  if (!connString) refuse("COMMONS_CONNECTION_STRING is not set. Add it to Api/.env before running reset-commons.");

  let config;
  try {
    config = DatabaseUrlParser.parseConnectionString(connString);
  } catch (err) {
    refuse(`COMMONS_CONNECTION_STRING could not be parsed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!ALLOWED_HOSTS.includes(config.host)) {
    refuse(`COMMONS_CONNECTION_STRING host "${config.host}" is not one of: ${ALLOWED_HOSTS.join(", ")}.\nreset-commons drops the database, so it only ever runs against a local MySQL.`);
  }

  const repoDir = process.env.COMMONS_CONTENT_REPO;
  if (!repoDir) refuse("COMMONS_CONTENT_REPO is not set. Point it at a WorshipCommonsContent checkout (the folder holding catalog.json).");
  if (!fs.existsSync(repoDir)) refuse(`COMMONS_CONTENT_REPO points at "${repoDir}", which does not exist.`);

  console.log(`reset-commons: recreating ${config.database} on ${config.host}...`);
  await recreateDatabase(config);
  console.log("Running commons migrations...");
  await migrate();
  console.log(`Seeding from ${repoDir}...`);
  await seed(repoDir);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("reset-commons failed:", err);
  process.exit(1);
});
