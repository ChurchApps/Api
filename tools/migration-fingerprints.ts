// Regenerate tools/migrations/fingerprints.json: what each migration does to the schema.
//
// Production's databases predate Kysely history (kysely_migration is empty), so the
// Server Admin migrations page cannot tell which migrations are already applied. This
// script applies every migration one at a time to a scratch database per module and
// records the tables, columns and indexes each one creates, drops or changes. The Api
// checks those facts against a live database's information_schema to baseline it.
//
//   yarn migrate:fingerprints        (needs local MySQL and .env; scratch DBs fp_<module> are dropped after)
//
// Only checks that still hold in the final schema are kept: if a later migration
// changes the same table, column or index, the earlier check is dropped as superseded.
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";
import { ensureEnvironment } from "./kysely-config.js";
import { getDbConfig } from "../src/shared/infrastructure/KyselyConnection.js";
import { listMigrationFiles } from "../src/shared/helpers/MigrationFiles.js";
import type { MigrationCheck, MigrationFingerprints } from "../src/shared/helpers/MigrationFingerprint.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// commons already has Kysely history in every environment.
const MODULES = ["membership", "attendance", "content", "giving", "messaging", "doing"];

interface Snapshot {
  tables: Set<string>;
  columns: Map<string, string>; // table.column -> "type|nullable"
  indexes: Map<string, string>; // table.index -> "col,col"
}

async function snapshot(db: Kysely<any>, database: string): Promise<Snapshot> {
  const tables = await sql<any>`SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${database} AND TABLE_TYPE = 'BASE TABLE'`.execute(db);
  const cols = await sql<any>`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS ty, IS_NULLABLE AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ${database}`.execute(db);
  const idx = await sql<any>`SELECT TABLE_NAME AS t, INDEX_NAME AS i, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cs FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ${database} GROUP BY TABLE_NAME, INDEX_NAME`.execute(db);
  return {
    tables: new Set(tables.rows.map((r) => r.t)),
    columns: new Map(cols.rows.map((r) => [`${r.t}.${r.c}`, `${String(r.ty).toLowerCase()}|${r.n}`])),
    indexes: new Map(idx.rows.map((r) => [`${r.t}.${r.i}`, r.cs]))
  };
}

function diff(a: Snapshot, b: Snapshot): MigrationCheck[] {
  const out: MigrationCheck[] = [];
  for (const t of b.tables) if (!a.tables.has(t)) out.push({ kind: "table", table: t, present: true });
  for (const t of a.tables) if (!b.tables.has(t)) out.push({ kind: "table", table: t, present: false });
  for (const [k, v] of b.columns) {
    const [table, column] = k.split(".");
    if (!b.tables.has(table) || !a.tables.has(table)) continue; // new/dropped table covers its columns
    if (!a.columns.has(k)) out.push({ kind: "column", table, column, present: true });
    else if (a.columns.get(k) !== v) {
      const [type, nullable] = v.split("|");
      out.push({ kind: "columnType", table, column, type, nullable: nullable === "YES" });
    }
  }
  for (const k of a.columns.keys()) {
    const [table, column] = k.split(".");
    if (b.tables.has(table) && a.tables.has(table) && !b.columns.has(k)) out.push({ kind: "column", table, column, present: false });
  }
  for (const [k, v] of b.indexes) {
    const [table, index] = k.split(".");
    if (!a.tables.has(table)) continue;
    if (a.indexes.get(k) !== v) out.push({ kind: "index", table, index, present: true });
  }
  for (const k of a.indexes.keys()) {
    const [table, index] = k.split(".");
    if (b.tables.has(table) && !b.indexes.has(k)) out.push({ kind: "index", table, index, present: false });
  }
  return out;
}

const objectKey = (c: MigrationCheck) => c.kind === "table" ? `t:${c.table}` : c.kind === "index" ? `i:${c.table}.${c.index}` : `c:${c.table}.${c.column}`;
const touches = (later: MigrationCheck, c: MigrationCheck) =>
  objectKey(later) === objectKey(c) || (later.kind === "table" && c.kind !== "table" && later.table === c.table);

async function fingerprintModule(moduleName: string): Promise<MigrationFingerprints[string]> {
  const cfg = getDbConfig(moduleName);
  const scratch = `fp_${moduleName}`;
  const admin = createPool({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, connectionLimit: 1 }).promise();
  await admin.execute(`DROP DATABASE IF EXISTS \`${scratch}\``);
  await admin.execute(`CREATE DATABASE \`${scratch}\``);
  const db = new Kysely<any>({ dialect: new MysqlDialect({ pool: createPool({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: scratch, connectionLimit: 2, charset: "utf8mb4" }) }) });
  const steps: { name: string; checks: MigrationCheck[] }[] = [];
  try {
    let before = await snapshot(db, scratch);
    for (const m of listMigrationFiles(path.join(__dirname, "migrations", moduleName))) {
      const mod = await import(pathToFileURL(m.file).href);
      await mod.up(db);
      const after = await snapshot(db, scratch);
      steps.push({ name: m.name, checks: diff(before, after) });
      before = after;
    }
  } finally {
    await db.destroy();
    await admin.execute(`DROP DATABASE IF EXISTS \`${scratch}\``);
    await admin.end();
  }
  const out: MigrationFingerprints[string] = {};
  steps.forEach((s, i) => {
    const later = steps.slice(i + 1).flatMap((x) => x.checks);
    const kept = s.checks.filter((c) => !later.some((l) => touches(l, c)));
    out[s.name] = { checks: kept, schemaChanges: s.checks.length };
  });
  return out;
}

async function main() {
  await ensureEnvironment();
  const result: MigrationFingerprints = {};
  for (const m of MODULES) {
    console.log(`[${m}] fingerprinting…`);
    result[m] = await fingerprintModule(m);
    const n = Object.values(result[m]);
    console.log(`  ${n.length} migrations, ${n.filter((x) => x.checks.length).length} with checks, ${n.filter((x) => !x.schemaChanges).length} data-only`);
  }
  const file = path.join(__dirname, "migrations", "fingerprints.json");
  fs.writeFileSync(file, JSON.stringify(result, null, 1) + "\n");
  console.log(`Wrote ${file}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
