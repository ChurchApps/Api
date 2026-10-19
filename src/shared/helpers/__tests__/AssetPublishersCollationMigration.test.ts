import fs from "fs";
import path from "path";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

// Prod 2026-10-18: ER_CANT_AGGREGATE_2COLLATIONS on /commons/assets/mine, /commons/submissions/mine, /commons/songs/mine
// and the nightly commonsWriterStats job. assetPublishers was created without DEFAULT CHARSET, so it took the
// database default (utf8mb4_unicode_ci) while assets has utf8mb4_0900_ai_ci. Reproduced on the slot's commons
// database with two scratch tables built the same two ways.
import { alignCollation } from "../../../../tools/migrations/commons/2026-10-18_asset_publishers_collation";

const db = buildDb();
const REF = "fpColl_assets";
const TBL = "fpColl_publishers";

describe("commons/2026-10-18_asset_publishers_collation", () => {
  beforeAll(async () => {
    await cleanup();
    await sql.raw(`CREATE TABLE \`${REF}\` (id char(11) NOT NULL PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).execute(db);
    await sql.raw(`CREATE TABLE \`${TBL}\` (assetId char(11) NOT NULL, userId char(11) NOT NULL, PRIMARY KEY (assetId, userId))`).execute(db);
    await sql.raw(`INSERT INTO \`${REF}\` VALUES ('A1'), ('A2')`).execute(db);
    await sql.raw(`INSERT INTO \`${TBL}\` VALUES ('A1', 'U1')`).execute(db);
  });

  afterAll(async () => {
    await cleanup();
    await db.destroy();
  });

  it("reproduces prod: the two tables cannot be compared before the migration", async () => {
    const before = await collations();
    if (before[REF] === before[TBL]) return; // a server whose database default already matches cannot show the bug
    await expect(mineQuery()).rejects.toMatchObject({ code: "ER_CANT_AGGREGATE_2COLLATIONS" });
  });

  it("converts the table to the reference collation and the query works", async () => {
    await alignCollation(db as Kysely<any>, TBL, REF);
    const after = await collations();
    expect(after[TBL]).toBe(after[REF]);
    expect(await mineQuery()).toEqual([{ id: "A1" }]);
  });

  it("is a no-op the second time", async () => {
    expect(await alignCollation(db as Kysely<any>, TBL, REF)).toBe(false);
  });
});

async function mineQuery() {
  const result = await sql<{ id: string }>`SELECT id FROM ${sql.table(REF)} WHERE id IN (SELECT assetId FROM ${sql.table(TBL)} WHERE userId = 'U1')`.execute(db);
  return result.rows;
}

async function collations(): Promise<Record<string, string>> {
  const result = await sql<{ t: string; c: string }>`SELECT TABLE_NAME as t, TABLE_COLLATION as c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${REF}, ${TBL})`.execute(db);
  return Object.fromEntries(result.rows.map((r) => [r.t, r.c]));
}

async function cleanup() {
  await sql.raw(`DROP TABLE IF EXISTS \`${TBL}\``).execute(db);
  await sql.raw(`DROP TABLE IF EXISTS \`${REF}\``).execute(db);
}

function buildDb(): Kysely<never> {
  const url = new URL(connectionString());
  return new Kysely<never>({
    dialect: new MysqlDialect({
      pool: createPool({
        host: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 3306,
        database: url.pathname.replace(/^\//, ""),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        connectionLimit: 2
      })
    })
  });
}

function connectionString() {
  if (process.env.COMMONS_CONNECTION_STRING) return process.env.COMMONS_CONNECTION_STRING;
  const envFile = path.resolve(__dirname, "../../../../.env");
  const match = fs.readFileSync(envFile, "utf8").match(/^COMMONS_CONNECTION_STRING=(.*)$/m);
  if (!match) throw new Error("COMMONS_CONNECTION_STRING not found in Api/.env");
  return match[1].trim();
}
