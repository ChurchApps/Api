import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Migrator, sql, type Migration, type MigrationProvider } from "kysely";
import { KyselyPool } from "../infrastructure/KyselyPool.js";
import { MIGRATION_MODULES, firstExisting, listMigrationFiles } from "./MigrationFiles.js";
import { detect, suggestBaseline, type DetectedMigration, type LiveSchema, type MigrationFingerprints } from "./MigrationFingerprint.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ModuleMigrationStatus {
  module: string;
  applied: number;
  pending: string[];
  lastApplied?: { name: string; at: string };
  /** kysely_migration is empty although the module has migrations — nothing may run. */
  noHistory?: boolean;
  error?: string;
}

export interface ModuleDetection {
  module: string;
  migrations: DetectedMigration[];
  suggested: string[];
  blocked?: string;
  error?: string;
}

export interface ModuleMigrationRun {
  module: string;
  applied: string[];
  failed?: string;
  error?: string;
}

/**
 * Runs tools/migrations from inside the Api — for production, whose databases only
 * accept connections from the VPC the Lambda runs in. Same Kysely migrator and the
 * same kysely_migration table as `yarn migrate`, so the two never disagree.
 *
 * Deployed: the build compiles tools/migrations to dist/_migrations (tsconfig.migrations.json).
 * Local dev (tsx): the .ts sources in tools/migrations.
 */
export class MigrationRunner {
  static root(): string | null {
    return firstExisting([
      path.resolve(__dirname, "../../_migrations/tools/migrations"),
      path.resolve(__dirname, "../../../tools/migrations")
    ]);
  }

  static isModule(name: string): boolean {
    return (MIGRATION_MODULES as readonly string[]).includes(name);
  }

  private static migrator(moduleName: string): Migrator {
    const root = this.root();
    if (!root) throw new Error("Migration files are not in this build");
    const folder = path.join(root, moduleName);
    const provider: MigrationProvider = {
      async getMigrations() {
        const out: Record<string, Migration> = {};
        for (const m of listMigrationFiles(folder)) out[m.name] = (await import(pathToFileURL(m.file).href)) as Migration;
        return out;
      }
    };
    // Unordered: after a baseline, a migration that never reached this database can sit
    // before ones that did; it still runs, in name order among the pending ones.
    return new Migrator({ db: KyselyPool.getDb(moduleName), provider, allowUnorderedMigrations: true });
  }

  private static fingerprints(moduleName: string): MigrationFingerprints[string] | null {
    const root = this.root();
    const file = root ? path.join(root, "fingerprints.json") : "";
    if (!file || !fs.existsSync(file)) return null;
    return (JSON.parse(fs.readFileSync(file, "utf8")) as MigrationFingerprints)[moduleName] || null;
  }

  private static async liveSchema(moduleName: string): Promise<LiveSchema> {
    const db = KyselyPool.getDb(moduleName);
    const tables = await sql<any>`SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`.execute(db);
    const cols = await sql<any>`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS ty, IS_NULLABLE AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`.execute(db);
    const idx = await sql<any>`SELECT DISTINCT TABLE_NAME AS t, INDEX_NAME AS i FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()`.execute(db);
    return {
      tables: new Set(tables.rows.map((r) => r.t)),
      columns: new Map(cols.rows.map((r) => [`${r.t}.${r.c}`, { type: String(r.ty).toLowerCase(), nullable: r.n === "YES" }])),
      indexes: new Set(idx.rows.map((r) => `${r.t}.${r.i}`))
    };
  }

  /** Which migrations the live schema already reflects, for a module with no history. Read-only. */
  static async detect(moduleName: string, rerun: string[] = []): Promise<ModuleDetection> {
    try {
      const prints = this.fingerprints(moduleName);
      if (!prints) return { module: moduleName, migrations: [], suggested: [], error: "No fingerprints for this module in this build" };
      const all = await this.migrator(moduleName).getMigrations();
      const migrations = detect(all.map((m) => m.name), prints, await this.liveSchema(moduleName));
      // Only partly applied migrations can be sent back to run again.
      const allowed = rerun.filter((r) => migrations.some((m) => m.name === r && m.state === "partial"));
      const { names, blocked } = suggestBaseline(migrations, allowed);
      return { module: moduleName, migrations, suggested: names, blocked };
    } catch (e: any) {
      return { module: moduleName, migrations: [], suggested: [], error: e?.message || String(e) };
    }
  }

  /**
   * Record migrations as already applied without running them. Only for a module with no
   * history, and only the names detect() suggests right now — never a caller-chosen list.
   */
  static async baseline(moduleName: string, names: string[], rerun: string[] = []): Promise<{ module: string; recorded: string[]; error?: string }> {
    const status = await this.status(moduleName);
    if (!status.noHistory) return { module: moduleName, recorded: [], error: "This module already has migration history" };
    const found = await this.detect(moduleName, rerun);
    if (found.error || found.blocked) return { module: moduleName, recorded: [], error: found.error || found.blocked };
    const same = names.length === found.suggested.length && names.every((n, i) => n === found.suggested[i]);
    if (!same) return { module: moduleName, recorded: [], error: "The schema no longer matches what was reviewed; check again" };
    if (!names.length) return { module: moduleName, recorded: [] };
    const db = KyselyPool.getDb<any>(moduleName);
    await sql`CREATE TABLE IF NOT EXISTS kysely_migration (name varchar(255) NOT NULL PRIMARY KEY, timestamp varchar(255) NOT NULL)`.execute(db);
    await sql`CREATE TABLE IF NOT EXISTS kysely_migration_lock (id varchar(255) NOT NULL PRIMARY KEY, is_locked int NOT NULL DEFAULT 0)`.execute(db);
    await sql`INSERT IGNORE INTO kysely_migration_lock (id, is_locked) VALUES ('migration_lock', 0)`.execute(db);
    const at = new Date().toISOString();
    await db.insertInto("kysely_migration").values(names.map((name) => ({ name, timestamp: at }))).execute();
    return { module: moduleName, recorded: names };
  }

  static async status(moduleName: string): Promise<ModuleMigrationStatus> {
    try {
      const all = await this.migrator(moduleName).getMigrations();
      const done = all.filter((m) => m.executedAt);
      const last = done[done.length - 1];
      return {
        module: moduleName,
        applied: done.length,
        pending: all.filter((m) => !m.executedAt).map((m) => m.name),
        lastApplied: last ? { name: last.name, at: last.executedAt.toISOString() } : undefined,
        noHistory: all.length > 0 && done.length === 0
      };
    } catch (e: any) {
      return { module: moduleName, applied: 0, pending: [], error: e?.message || String(e) };
    }
  }

  static async statusAll(): Promise<ModuleMigrationStatus[]> {
    const out: ModuleMigrationStatus[] = [];
    for (const m of MIGRATION_MODULES) out.push(await this.status(m));
    return out;
  }

  /**
   * Apply every pending migration for one module, oldest first. Stops at the first failure.
   * Refuses a module with no migration history: its tables were built some other way
   * (demo's nightly refresh truncates kysely_migration), and "pending" would mean replaying
   * every migration from the initial schema — data migrations included — over live tables.
   */
  static async run(moduleName: string): Promise<ModuleMigrationRun> {
    const before = await this.status(moduleName);
    if (before.error) return { module: moduleName, applied: [], error: before.error };
    if (before.noHistory) {
      return { module: moduleName, applied: [], error: "No migration history in this database (kysely_migration is empty), so nothing was run. Record the applied migrations with yarn migrate before running any." };
    }
    try {
      const { error, results } = await this.migrator(moduleName).migrateToLatest();
      const applied = (results || []).filter((r) => r.status === "Success").map((r) => r.migrationName);
      const failed = (results || []).find((r) => r.status === "Error")?.migrationName;
      return { module: moduleName, applied, failed, error: error ? (error as any)?.message || String(error) : undefined };
    } catch (e: any) {
      return { module: moduleName, applied: [], error: e?.message || String(e) };
    }
  }
}
