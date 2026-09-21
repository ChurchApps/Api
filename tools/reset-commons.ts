import * as fs from "fs";
import * as path from "path";
import mysql from "mysql2/promise";
import { DatabaseUrlParser } from "../src/shared/helpers/DatabaseUrlParser.js";
import { ensureEnvironment } from "./kysely-config.js";
import { commonsUp } from "./commons-up.js";

const ALLOWED_HOSTS = ["localhost", "127.0.0.1"] as const;
const CONTENT_DIR = path.resolve("content", "commons");

function refuse(message: string): never {
  console.error("\n========================================");
  console.error("reset-commons refused to run.");
  console.error(message);
  console.error("========================================\n");
  process.exit(1);
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

/** The local content dir holds exactly the repo's layout, the way the bucket does after the content repo's `sync push`. */
function mirrorContent(repoDir: string) {
  if ((process.env.FILE_STORE || "").toUpperCase() === "S3") return;
  for (const dir of ["writers", "songs", "works", "assets", "pending"]) fs.rmSync(path.join(CONTENT_DIR, dir), { recursive: true, force: true });
  let mirrored = 0;
  for (const dir of ["songs", "writers"]) {
    const from = path.join(repoDir, dir);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(CONTENT_DIR, dir), { recursive: true });
    mirrored++;
  }
  console.log(`  Mirrored ${mirrored} top-level folders of the package layout into ${CONTENT_DIR}`);
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
  mirrorContent(repoDir);
  await commonsUp(repoDir);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("reset-commons failed:", err);
  process.exit(1);
});
