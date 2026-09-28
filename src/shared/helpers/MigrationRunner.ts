import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Migrator, type Migration, type MigrationProvider } from "kysely";
import { KyselyPool } from "../infrastructure/KyselyPool.js";
import { MIGRATION_MODULES, firstExisting, listMigrationFiles } from "./MigrationFiles.js";

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
    return new Migrator({ db: KyselyPool.getDb(moduleName), provider });
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
