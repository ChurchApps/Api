import * as fs from "fs";
import * as path from "path";

/** Modules that keep migrations under tools/migrations/<module>. Same list as tools/kysely-config.ts. */
export const MIGRATION_MODULES = ["membership", "attendance", "content", "giving", "messaging", "doing", "commons"] as const;

/**
 * The migration files in one module folder, as { name, file }. The name is the file
 * name without its extension, so a compiled `.js` and its `.ts` source record the
 * same row in kysely_migration — the CLI and the server-admin runner agree.
 */
export function listMigrationFiles(folder: string): { name: string; file: string }[] {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter((f) => /\.(js|ts|mjs|cjs)$/.test(f) && !/\.d\.[cm]?ts$/.test(f) && !/\.(spec|test)\.[jt]s$/.test(f))
    .sort()
    .map((f) => ({ name: f.replace(/\.(js|ts|mjs|cjs)$/, ""), file: path.resolve(folder, f) }));
}

/** First candidate root that exists. */
export function firstExisting(candidates: string[]): string | null {
  return candidates.find((c) => fs.existsSync(c)) || null;
}
