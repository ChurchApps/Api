/** One fact a migration leaves in the schema, as recorded by tools/migration-fingerprints.ts. */
export type MigrationCheck =
  | { kind: "table"; table: string; present: boolean }
  | { kind: "column"; table: string; column: string; present: boolean }
  | { kind: "columnType"; table: string; column: string; type: string; nullable: boolean }
  | { kind: "index"; table: string; index: string; present: boolean };

/** module -> migration name -> checks still true in the final schema (+ how many changes it made in total). */
export type MigrationFingerprints = Record<string, Record<string, { checks: MigrationCheck[]; schemaChanges: number }>>;

export interface LiveSchema {
  tables: Set<string>;
  columns: Map<string, { type: string; nullable: boolean }>;
  indexes: Set<string>;
}

/**
 * applied  — every check holds in the live schema
 * missing  — no check holds
 * partial  — some hold; needs a person
 * unknown  — no checks to go on: data-only, or every change superseded by a later migration
 */
export type DetectedState = "applied" | "missing" | "partial" | "unknown";

export interface DetectedMigration { name: string; state: DetectedState; checks: number; failing: string[] }

export function describeCheck(c: MigrationCheck): string {
  switch (c.kind) {
    case "table": return `${c.present ? "table" : "no table"} ${c.table}`;
    case "column": return `${c.present ? "column" : "no column"} ${c.table}.${c.column}`;
    case "columnType": return `${c.table}.${c.column} is ${c.type}${c.nullable ? " null" : " not null"}`;
    case "index": return `${c.present ? "index" : "no index"} ${c.table}.${c.index}`;
  }
}

export function checkHolds(c: MigrationCheck, live: LiveSchema): boolean {
  switch (c.kind) {
    case "table": return live.tables.has(c.table) === c.present;
    case "column": return live.columns.has(`${c.table}.${c.column}`) === c.present;
    case "columnType": {
      const col = live.columns.get(`${c.table}.${c.column}`);
      return !!col && col.type === c.type && col.nullable === c.nullable;
    }
    case "index": return live.indexes.has(`${c.table}.${c.index}`) === c.present;
  }
}

export function detect(names: string[], prints: MigrationFingerprints[string], live: LiveSchema): DetectedMigration[] {
  return names.map((name) => {
    const checks = prints?.[name]?.checks || [];
    const failing = checks.filter((c) => !checkHolds(c, live)).map(describeCheck);
    const state: DetectedState = checks.length === 0 ? "unknown" : failing.length === 0 ? "applied" : failing.length === checks.length ? "missing" : "partial";
    return { name, state, checks: checks.length, failing };
  });
}

/**
 * Which migrations to record as already applied. Everything up to the last "applied" one,
 * except "missing" ones (they stay pending and run next). "unknown" ones before that point
 * shipped in releases that are clearly live, so they count as applied. Nothing is suggested
 * while any migration is "partial" — a half-applied migration needs a person.
 */
export function suggestBaseline(detected: DetectedMigration[]): { names: string[]; blocked?: string } {
  const partial = detected.filter((d) => d.state === "partial");
  if (partial.length) return { names: [], blocked: "Partly applied: " + partial.map((p) => p.name).join(", ") };
  let last = -1;
  detected.forEach((d, i) => { if (d.state === "applied") last = i; });
  return { names: detected.slice(0, last + 1).filter((d) => d.state !== "missing").map((d) => d.name) };
}
