import "reflect-metadata";
import fs from "fs";
import path from "path";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

// Issue #1206: Server Admin > Churches search returned "No churches found" for a church ID,
// because ChurchRepo.search() only matched on name.

// The real membership database, without pulling in Environment/apihelper (ESM-only in Jest).
const dbs: Record<string, Kysely<never>> = { membership: buildDb("MEMBERSHIP") };

jest.mock("../../../../shared/infrastructure/KyselyPool", () => ({ KyselyPool: { getDb: (moduleName: string) => dbs[moduleName] } }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "gen" } }));

import { ChurchRepo } from "../ChurchRepo";

describe("ChurchRepo.search", () => {
  beforeAll(async () => {
    await cleanup();
    await dbs.membership.insertInto("churches" as never).values([
      { id: "tstcsrch1", name: "Tstcsrch First Baptist Church", subDomain: "tstcsrchfirst" },
      { id: "tstcsrch2", name: "Tstcsrch Grace Fellowship", subDomain: "tstcsrchgrace" }
    ] as never).execute();
  });

  afterAll(async () => {
    await cleanup();
    await dbs.membership.destroy();
  });

  const ids = (rows: any[]) => rows.map((r) => r.id);

  it("finds a church by its id", async () => {
    expect(ids(await new ChurchRepo().search("tstcsrch2", true))).toEqual(["tstcsrch2"]);
  });

  it("still finds a church by name, with spaces between any words", async () => {
    expect(ids(await new ChurchRepo().search("Tstcsrch First Church", true))).toEqual(["tstcsrch1"]);
  });
});

async function cleanup() {
  await sql`DELETE FROM churches WHERE id IN ('tstcsrch1', 'tstcsrch2')`.execute(dbs.membership);
}

function buildDb(prefix: string): Kysely<never> {
  const url = new URL(connectionString(prefix + "_CONNECTION_STRING"));
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

function connectionString(key: string) {
  if (process.env[key]) return process.env[key] as string;
  const envFile = path.resolve(__dirname, "../../../../../.env");
  const match = fs.readFileSync(envFile, "utf8").match(new RegExp("^" + key + "=(.*)$", "m"));
  if (!match) throw new Error(key + " not found in Api/.env");
  return match[1].trim();
}
