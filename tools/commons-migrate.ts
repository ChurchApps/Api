import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Migrator, type Migration, type MigrationProvider } from "kysely";
import { createKysely } from "./kysely-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Kysely's built-in provider fails on Windows with raw OS paths; we convert to file:// URLs.
export class FileURLMigrationProvider implements MigrationProvider {
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

/** The commons schema: DDL only. Content lands through commons-up's upsert, never through a migration. */
export async function runCommonsMigrations() {
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
