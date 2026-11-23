import "reflect-metadata";
import fs from "fs";
import path from "path";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

// Issue #1173: a church with two church-level rows for the same key saw Admin edit
// the first row while /settings/public returned the last, so the live site kept the old value.

const db = buildDb();
let idCounter = 0;

jest.mock("../../db/index", () => ({ getDb: () => db }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, ArrayHelper: {}, UniqueIdHelper: { shortId: () => "tst1173_" + (++idCounter) } }));

import { SettingRepo } from "../SettingRepo";

const CHURCH_ID = "tst1173";
// settings.public is BIT(1): clients post a number even though Setting types it as a string, and "1" is too long for the column.
const PUBLIC_ON = 1 as unknown as string;
const PUBLIC_OFF = 0 as unknown as string;

describe("content SettingRepo with duplicate church-level rows", () => {
  beforeEach(cleanup);

  afterAll(async () => {
    await cleanup();
    await db.destroy();
  });

  it("public settings return the value Admin just saved", async () => {
    await sql`INSERT INTO settings (id, churchId, userId, keyName, value, public) VALUES
      ('aaaaaaaaaaa', ${CHURCH_ID}, NULL, 'announcementBanner', 'Old banner', 1),
      ('bbbbbbbbbbb', ${CHURCH_ID}, NULL, 'announcementBanner', 'Old banner', 1)`.execute(db);
    const repo = new SettingRepo();

    // B1Admin SiteWidgetsEdit: load all, take the first matching row, post it back by id.
    const adminRow = (await repo.loadAll(CHURCH_ID)).find((s) => s.keyName === "announcementBanner");
    await repo.save({ ...adminRow, value: "New banner" });

    const publicResult: Record<string, string> = {};
    (await repo.loadPublicSettings(CHURCH_ID)).forEach((s) => { publicResult[s.keyName] = s.value; });
    expect(publicResult.announcementBanner).toBe("New banner");

    const remaining = await sql<{ id: string }>`SELECT id FROM settings WHERE churchId = ${CHURCH_ID} AND keyName = 'announcementBanner'`.execute(db);
    expect(remaining.rows).toHaveLength(1);
  });

  it("a save without an id updates the existing church-level row", async () => {
    const repo = new SettingRepo();
    const first = await repo.save({ churchId: CHURCH_ID, keyName: "hidePublicSite", value: "true", public: PUBLIC_ON });
    const second = await repo.save({ churchId: CHURCH_ID, keyName: "hidePublicSite", value: "false", public: PUBLIC_ON });

    const rows = (await repo.loadAll(CHURCH_ID)).filter((s) => s.keyName === "hidePublicSite");
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("false");
    expect(second.id).toBe(first.id);
  });

  it("leaves user-level rows and multi-row sermon import keys alone", async () => {
    const repo = new SettingRepo();
    await sql`INSERT INTO settings (id, churchId, userId, keyName, value, public) VALUES
      ('ccccccccccc', ${CHURCH_ID}, NULL, 'youtubeChannelId', 'chan1', 1),
      ('ddddddddddd', ${CHURCH_ID}, NULL, 'youtubeChannelId', 'chan2', 1)`.execute(db);
    await repo.save({ churchId: CHURCH_ID, keyName: "theme", value: "church", public: PUBLIC_OFF });
    await repo.save({ churchId: CHURCH_ID, userId: "user1173", keyName: "theme", value: "dark", public: PUBLIC_OFF });
    await repo.save({ churchId: CHURCH_ID, userId: "user1173", keyName: "theme", value: "light", public: PUBLIC_OFF });
    await repo.save({ churchId: CHURCH_ID, keyName: "youtubeChannelId", value: "chan3", public: PUBLIC_ON });

    expect((await repo.loadAll(CHURCH_ID)).filter((s) => s.keyName === "youtubeChannelId")).toHaveLength(3);
    expect((await repo.loadAll(CHURCH_ID)).find((s) => s.keyName === "theme").value).toBe("church");
    expect(await repo.loadUser(CHURCH_ID, "user1173")).toHaveLength(2);
  });
});

async function cleanup() {
  await sql`DELETE FROM settings WHERE churchId = ${CHURCH_ID}`.execute(db);
}

function buildDb(): Kysely<never> {
  const url = new URL(contentConnectionString());
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

function contentConnectionString() {
  if (process.env.CONTENT_CONNECTION_STRING) return process.env.CONTENT_CONNECTION_STRING;
  const envFile = path.resolve(__dirname, "../../../../../.env");
  const match = fs.readFileSync(envFile, "utf8").match(/^CONTENT_CONNECTION_STRING=(.*)$/m);
  if (!match) throw new Error("CONTENT_CONNECTION_STRING not found in Api/.env");
  return match[1].trim();
}
