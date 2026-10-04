import "reflect-metadata";
import fs from "fs";
import path from "path";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

// Production log: GET /membership/groups/search returned 500 ER_NO_SUCH_TABLE
// "membership.groupServiceTimes" — groupServiceTimes, serviceTimes and services live in
// the attendance database, so the service filter must be resolved there.

// The real membership and attendance databases, without pulling in Environment/apihelper (ESM-only in Jest).
const dbs: Record<string, Kysely<never>> = { membership: buildDb("MEMBERSHIP"), attendance: buildDb("ATTENDANCE") };

jest.mock("../../../../shared/infrastructure/KyselyPool", () => ({ KyselyPool: { getDb: (moduleName: string) => dbs[moduleName] } }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "gen" } }));

import { GroupRepo } from "../GroupRepo";

const CHURCH_ID = "tstgsrch";

describe("GroupRepo.search", () => {
  beforeAll(async () => {
    await cleanup();
    await dbs.membership.insertInto("groups" as never).values([
      { id: "tstgsrchg1", churchId: CHURCH_ID, name: "Alpha", categoryName: "Kids", removed: 0 },
      { id: "tstgsrchg2", churchId: CHURCH_ID, name: "Bravo", categoryName: "Kids", removed: 0 },
      { id: "tstgsrchg3", churchId: CHURCH_ID, name: "Charlie", categoryName: "Adults", removed: 0 },
      { id: "tstgsrchg4", churchId: CHURCH_ID, name: "Delta", categoryName: "Adults", removed: 1 }
    ] as never).execute();
    await dbs.attendance.insertInto("services" as never).values([
      { id: "tstgsrchs1", churchId: CHURCH_ID, campusId: "tstgsrchc1", name: "Sunday", removed: 0 },
      { id: "tstgsrchs2", churchId: CHURCH_ID, campusId: "tstgsrchc2", name: "Sunday", removed: 0 }
    ] as never).execute();
    await dbs.attendance.insertInto("serviceTimes" as never).values([
      { id: "tstgsrcht1", churchId: CHURCH_ID, serviceId: "tstgsrchs1", name: "9am", removed: 0 },
      { id: "tstgsrcht2", churchId: CHURCH_ID, serviceId: "tstgsrchs2", name: "11am", removed: 0 }
    ] as never).execute();
    await dbs.attendance.insertInto("groupServiceTimes" as never).values([
      { id: "tstgsrchx1", churchId: CHURCH_ID, groupId: "tstgsrchg1", serviceTimeId: "tstgsrcht1" },
      { id: "tstgsrchx2", churchId: CHURCH_ID, groupId: "tstgsrchg2", serviceTimeId: "tstgsrcht2" },
      { id: "tstgsrchx3", churchId: CHURCH_ID, groupId: "tstgsrchg4", serviceTimeId: "tstgsrcht1" }
    ] as never).execute();
  });

  afterAll(async () => {
    await cleanup();
    await dbs.membership.destroy();
    await dbs.attendance.destroy();
  });

  const names = (rows: any[]) => rows.map((r) => r.name);

  it("returns every active group when no filter is set", async () => {
    expect(names(await new GroupRepo().search(CHURCH_ID, "0", "0", "0"))).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("filters by service time", async () => {
    expect(names(await new GroupRepo().search(CHURCH_ID, "0", "0", "tstgsrcht1"))).toEqual(["Alpha"]);
  });

  it("filters by service", async () => {
    expect(names(await new GroupRepo().search(CHURCH_ID, "0", "tstgsrchs2", "0"))).toEqual(["Bravo"]);
  });

  it("filters by campus", async () => {
    expect(names(await new GroupRepo().search(CHURCH_ID, "tstgsrchc1", "0", "0"))).toEqual(["Alpha"]);
  });

  it("returns nothing when no group meets at the service time", async () => {
    expect(await new GroupRepo().search(CHURCH_ID, "0", "0", "tstgsrchnone")).toEqual([]);
  });
});

async function cleanup() {
  await sql`DELETE FROM \`groups\` WHERE churchId = ${CHURCH_ID}`.execute(dbs.membership);
  await sql`DELETE FROM groupServiceTimes WHERE churchId = ${CHURCH_ID}`.execute(dbs.attendance);
  await sql`DELETE FROM serviceTimes WHERE churchId = ${CHURCH_ID}`.execute(dbs.attendance);
  await sql`DELETE FROM services WHERE churchId = ${CHURCH_ID}`.execute(dbs.attendance);
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
