import "reflect-metadata";
import fs from "fs";
import path from "path";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

// Issues #1168 / #1169: B1Admin's group Sessions tab loads GET /sessions?groupId=,
// which reads through loadByGroupIdWithNames. Without sessionDate the roll sheet
// prints a blank date, and without serviceTimeId "Print All Classes" never shows.

// The real attendance database, without pulling in Environment/apihelper (ESM-only in Jest).
const db = buildDb();

jest.mock("../../db/index", () => ({ getDb: () => db }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "tst" } }));

import { SessionRepo } from "../SessionRepo";

const CHURCH_ID = "tst1168";
const GROUP_ID = "tst1168g";

describe("SessionRepo.loadByGroupIdWithNames", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insertInto("serviceTimes" as never).values({ id: "tst1168st", churchId: CHURCH_ID, serviceId: "tst1168s", name: "9:00 AM", removed: false } as never).execute();
    await db.insertInto("sessions" as never).values({ id: "tst1168a", churchId: CHURCH_ID, groupId: GROUP_ID, serviceTimeId: "tst1168st", sessionDate: "2026-09-27" } as never).execute();
  });

  afterAll(async () => {
    await cleanup();
    await db.destroy();
  });

  it("returns the session date, service time, and group with the display name", async () => {
    const rows: any[] = await new SessionRepo().loadByGroupIdWithNames(CHURCH_ID, GROUP_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("09/27/2026 - 9:00 AM");
    expect(rows[0].groupId).toBe(GROUP_ID);
    expect(rows[0].serviceTimeId).toBe("tst1168st");
    expect(rows[0].sessionDate).toBeTruthy();
  });

  it("stays scoped to the church", async () => {
    const rows = await new SessionRepo().loadByGroupIdWithNames("tst1168other", GROUP_ID);
    expect(rows).toHaveLength(0);
  });
});

async function cleanup() {
  await sql`DELETE FROM sessions WHERE churchId = ${CHURCH_ID}`.execute(db);
  await sql`DELETE FROM serviceTimes WHERE churchId = ${CHURCH_ID}`.execute(db);
}

function buildDb(): Kysely<never> {
  const url = new URL(attendanceConnectionString());
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

function attendanceConnectionString() {
  if (process.env.ATTENDANCE_CONNECTION_STRING) return process.env.ATTENDANCE_CONNECTION_STRING;
  const envFile = path.resolve(__dirname, "../../../../../.env");
  const match = fs.readFileSync(envFile, "utf8").match(/^ATTENDANCE_CONNECTION_STRING=(.*)$/m);
  if (!match) throw new Error("ATTENDANCE_CONNECTION_STRING not found in Api/.env");
  return match[1].trim();
}
