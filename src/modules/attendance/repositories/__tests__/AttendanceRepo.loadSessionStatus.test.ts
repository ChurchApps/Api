import "reflect-metadata";
import fs from "fs";
import path from "path";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

// Issue #1171: the session screen lists every group that meets at a service time
// on one date, marked entered or not entered, so nobody's attendance gets missed.

// The real attendance database, without pulling in Environment/apihelper (ESM-only in Jest).
const db = buildDb();

jest.mock("../../db/index", () => ({ getDb: () => db }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, DateHelper: { toMysqlDate: jest.fn() } }));

import { AttendanceRepo } from "../AttendanceRepo";

const CHURCH_ID = "tst1171";
const ST_ID = "tst1171st";

describe("AttendanceRepo.loadSessionStatus", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insertInto("groupServiceTimes" as never).values([
      { id: "tst1171gst1", churchId: CHURCH_ID, groupId: "tst1171g1", serviceTimeId: ST_ID },
      { id: "tst1171gst2", churchId: CHURCH_ID, groupId: "tst1171g2", serviceTimeId: ST_ID },
      { id: "tst1171gst3", churchId: CHURCH_ID, groupId: "tst1171g3", serviceTimeId: ST_ID },
      { id: "tst1171gst4", churchId: CHURCH_ID, groupId: "tst1171g4", serviceTimeId: "tst1171oth" }
    ] as never).execute();
    await db.insertInto("sessions" as never).values([
      // g1: session with two visits; g2: session, nobody marked; g3: only a session on another date.
      { id: "tst1171s1", churchId: CHURCH_ID, groupId: "tst1171g1", serviceTimeId: ST_ID, sessionDate: "2026-09-27" },
      { id: "tst1171s2", churchId: CHURCH_ID, groupId: "tst1171g2", serviceTimeId: ST_ID, sessionDate: "2026-09-27" },
      { id: "tst1171s3", churchId: CHURCH_ID, groupId: "tst1171g3", serviceTimeId: ST_ID, sessionDate: "2026-09-20" }
    ] as never).execute();
    await db.insertInto("visitSessions" as never).values([
      { id: "tst1171vs1", churchId: CHURCH_ID, visitId: "tst1171v1", sessionId: "tst1171s1" },
      { id: "tst1171vs2", churchId: CHURCH_ID, visitId: "tst1171v2", sessionId: "tst1171s1" },
      { id: "tst1171vs3", churchId: CHURCH_ID, visitId: "tst1171v3", sessionId: "tst1171s3" }
    ] as never).execute();
  });

  afterAll(async () => {
    await cleanup();
    await db.destroy();
  });

  it("returns every group at the service time with its session and attendance count for the date", async () => {
    const rows: any[] = await new AttendanceRepo().loadSessionStatus(CHURCH_ID, ST_ID, "2026-09-27");
    const byGroup = Object.fromEntries(rows.map((r) => [r.groupId, r]));
    expect(Object.keys(byGroup).sort()).toEqual(["tst1171g1", "tst1171g2", "tst1171g3"]);
    expect(byGroup.tst1171g1.sessionId).toBe("tst1171s1");
    expect(Number(byGroup.tst1171g1.attendanceCount)).toBe(2);
    expect(byGroup.tst1171g2.sessionId).toBe("tst1171s2");
    expect(Number(byGroup.tst1171g2.attendanceCount)).toBe(0);
    expect(byGroup.tst1171g3.sessionId).toBeNull();
    expect(Number(byGroup.tst1171g3.attendanceCount)).toBe(0);
  });

  it("stays scoped to the church", async () => {
    const rows = await new AttendanceRepo().loadSessionStatus("tst1171x", ST_ID, "2026-09-27");
    expect(rows).toHaveLength(0);
  });
});

async function cleanup() {
  await sql`DELETE FROM visitSessions WHERE churchId = ${CHURCH_ID}`.execute(db);
  await sql`DELETE FROM sessions WHERE churchId = ${CHURCH_ID}`.execute(db);
  await sql`DELETE FROM groupServiceTimes WHERE churchId = ${CHURCH_ID}`.execute(db);
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
