import "reflect-metadata";
import fs from "fs";
import path from "path";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

// Issue #1092: a settings POST without an id (e.g. B1Admin saving before its
// initial load finished) inserted a second row for the same church + keyName,
// and the public settings endpoint then returned whichever row came back last.

const db = buildDb();
let idCounter = 0;

jest.mock("../../db/index", () => ({ getDb: () => db }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "tst1092_" + (++idCounter) } }));

import { SettingRepo } from "../SettingRepo";

const CHURCH_ID = "tst1092";

describe("SettingRepo.save without an id", () => {
  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    await db.destroy();
  });

  it("updates the existing row for the church and key instead of adding a duplicate", async () => {
    const repo = new SettingRepo();
    const first = await repo.save({ churchId: CHURCH_ID, keyName: "directoryVisibility", value: "Everyone", public: 1 } as any);
    const second = await repo.save({ churchId: CHURCH_ID, keyName: "directoryVisibility", value: "Staff", public: 1 } as any);

    const rows = await repo.loadAll(CHURCH_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("Staff");
    expect(second.id).toBe(first.id);
  });

  it("still creates separate rows for different keys and churches", async () => {
    const repo = new SettingRepo();
    await repo.save({ churchId: CHURCH_ID, keyName: "directoryVisibility", value: "Everyone", public: 1 } as any);
    await repo.save({ churchId: CHURCH_ID, keyName: "phoneVisibility", value: "members", public: 1 } as any);
    await repo.save({ churchId: CHURCH_ID + "b", keyName: "directoryVisibility", value: "Staff", public: 1 } as any);

    expect(await repo.loadAll(CHURCH_ID)).toHaveLength(2);
    expect(await repo.loadAll(CHURCH_ID + "b")).toHaveLength(1);
  });

  it("rejects a second row for the same church and key at the database", async () => {
    await sql`INSERT INTO settings (id, churchId, keyName, value, public) VALUES ('aaaaaaaaaaa', ${CHURCH_ID}, 'directoryVisibility', 'Regular Attendees', 1)`.execute(db);
    await expect(sql`INSERT INTO settings (id, churchId, keyName, value, public) VALUES ('bbbbbbbbbbb', ${CHURCH_ID}, 'directoryVisibility', 'Members', 1)`.execute(db)).rejects.toThrow(/duplicate entry/i);
  });

  it("public settings keep the lowest-id duplicate so Regular Attendees is not overwritten by Members", async () => {
    const repo = new SettingRepo();
    await sql`INSERT INTO settings (id, churchId, keyName, value, public) VALUES ('aaaaaaaaaaa', ${CHURCH_ID}, 'directoryVisibility', 'Regular Attendees', 1)`.execute(db);
    try {
      await sql`INSERT INTO settings (id, churchId, keyName, value, public) VALUES
        ('bbbbbbbbbbb', ${CHURCH_ID}, 'directoryVisibility', 'Members', 1),
        ('ccccccccccc', ${CHURCH_ID}, 'directoryVisibility', 'Members', 1)`.execute(db);
    } catch (err: any) {
      expect(/duplicate entry/i.test(err?.message || "")).toBe(true);
      return;
    }

    const publicRows = await repo.loadPublicSettings(CHURCH_ID);
    const visibility = publicRows.filter((s: any) => s.keyName === "directoryVisibility");
    expect(visibility).toHaveLength(1);
    expect(visibility[0].id).toBe("aaaaaaaaaaa");
    expect(visibility[0].value).toBe("Regular Attendees");

    await repo.save({ id: "aaaaaaaaaaa", churchId: CHURCH_ID, keyName: "directoryVisibility", value: "Regular Attendees", public: 1 } as any);
    const remaining = await sql<{ id: string; value: string }>`SELECT id, value FROM settings WHERE churchId = ${CHURCH_ID} AND keyName = 'directoryVisibility'`.execute(db);
    expect(remaining.rows).toEqual([{ id: "aaaaaaaaaaa", value: "Regular Attendees" }]);
  });

  it("insert reuses the existing church and key instead of adding a row", async () => {
    const repo = new SettingRepo();
    const first = await repo.save({ churchId: CHURCH_ID, keyName: "directoryVisibility", value: "Members", public: 1 } as any);
    const second = await repo.insert({ churchId: CHURCH_ID, keyName: "directoryVisibility", value: "Regular Attendees", public: 1 } as any);

    const rows = await repo.loadAll(CHURCH_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].value).toBe("Regular Attendees");
    expect(second.id).toBe(first.id);
  });
});

async function cleanup() {
  await sql`DELETE FROM settings WHERE churchId IN (${CHURCH_ID}, ${CHURCH_ID + "b"})`.execute(db);
}

function buildDb(): Kysely<never> {
  const url = new URL(membershipConnectionString());
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

function membershipConnectionString() {
  if (process.env.MEMBERSHIP_CONNECTION_STRING) return process.env.MEMBERSHIP_CONNECTION_STRING;
  const envFile = path.resolve(__dirname, "../../../../../.env");
  const match = fs.readFileSync(envFile, "utf8").match(/^MEMBERSHIP_CONNECTION_STRING=(.*)$/m);
  if (!match) throw new Error("MEMBERSHIP_CONNECTION_STRING not found in Api/.env");
  return match[1].trim();
}
