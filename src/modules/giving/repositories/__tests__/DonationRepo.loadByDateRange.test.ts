import "reflect-metadata";
import fs from "fs";
import path from "path";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

// GET /giving/donations?startDate&endDate (giving statements) reads through loadByDateRange: one year, not the whole history.

const db = buildDb();

jest.mock("../../db/index", () => ({ getDb: () => db }));
jest.mock("@churchapps/apihelper", () => ({
  __esModule: true,
  UniqueIdHelper: { shortId: () => "tst" },
  DateHelper: { toMysqlDate: (d: Date) => d.toISOString() },
  ArrayHelper: { getOne: () => null }
}));
jest.mock("../../../../shared/webhooks/index", () => ({ __esModule: true, WebhookDispatcher: { emit: jest.fn() } }));

import { DonationRepo } from "../DonationRepo";

const CHURCH_ID = "tstrange";
const donation = (id: string, donationDate: string, status: string | null = "complete") =>
  ({ id, churchId: CHURCH_ID, donationDate, amount: 10, method: "Check", entryTime: donationDate + " 10:00:00", status }) as never;

describe("DonationRepo.loadByDateRange", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insertInto("donations" as never).values([
      donation("tstrgBefor", "2025-12-31"),
      donation("tstrgFirst", "2026-01-01"),
      donation("tstrgLast", "2026-12-31", null),
      donation("tstrgAfter", "2027-01-01"),
      donation("tstrgPend", "2026-06-01", "pending")
    ]).execute();
  });

  afterAll(async () => {
    await cleanup();
    await db.destroy();
  });

  it("returns complete gifts inside the range, both ends included, newest first", async () => {
    const rows = await new DonationRepo().loadByDateRange(CHURCH_ID, "2026-01-01", "2026-12-31");
    expect(rows.map((r: any) => r.id)).toEqual(["tstrgLast", "tstrgFirst"]);
  });

  it("stays scoped to the church", async () => {
    expect(await new DonationRepo().loadByDateRange("tstrangeother", "2026-01-01", "2026-12-31")).toHaveLength(0);
  });
});

async function cleanup() {
  await sql`DELETE FROM donations WHERE churchId = ${CHURCH_ID}`.execute(db);
}

function buildDb(): Kysely<never> {
  const url = new URL(givingConnectionString());
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

function givingConnectionString() {
  if (process.env.GIVING_CONNECTION_STRING) return process.env.GIVING_CONNECTION_STRING;
  const envFile = path.resolve(__dirname, "../../../../../.env");
  const match = fs.readFileSync(envFile, "utf8").match(/^GIVING_CONNECTION_STRING=(.*)$/m);
  if (!match) throw new Error("GIVING_CONNECTION_STRING not found in Api/.env");
  return match[1].trim();
}
