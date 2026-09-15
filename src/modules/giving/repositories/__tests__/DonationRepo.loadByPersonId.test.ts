import "reflect-metadata";
import fs from "fs";
import path from "path";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

// Issue #1087: a donation recorded against a person but with no fundDonations
// allocation row disappeared from that person's giving history. Both the B1App
// member portal (GET /giving/donations/my) and B1Admin People > Donations
// (GET /giving/donations?personId=) read through loadByPersonId.

// The real giving database, without pulling in Environment/apihelper (ESM-only in Jest).
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

const CHURCH_ID = "tst1087";
const PERSON_ID = "tst1087p";

describe("DonationRepo.loadByPersonId", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insertInto("funds" as never).values({ id: "tst1087f", churchId: CHURCH_ID, name: "General", taxDeductible: true } as never).execute();
    await db.insertInto("donations" as never).values({ id: "tst1087da", churchId: CHURCH_ID, personId: PERSON_ID, donationDate: "2026-09-01", amount: 50, method: "Check", entryTime: "2026-09-01 10:00:00", status: "complete" } as never).execute();
    await db.insertInto("fundDonations" as never).values({ id: "tst1087fd", churchId: CHURCH_ID, donationId: "tst1087da", fundId: "tst1087f", amount: 50 } as never).execute();
    // Same person, but the fund allocation row is missing (e.g. batch entry where
    // the follow-up POST /funddonations never landed).
    await db.insertInto("donations" as never).values({ id: "tst1087db", churchId: CHURCH_ID, personId: PERSON_ID, donationDate: "2026-09-02", amount: 75, method: "Cash", entryTime: "2026-09-02 10:00:00", status: "complete" } as never).execute();
  });

  afterAll(async () => {
    await cleanup();
    await db.destroy();
  });

  it("returns donations that have a fund allocation", async () => {
    const rows = await new DonationRepo().loadByPersonId(CHURCH_ID, PERSON_ID);
    expect(rows.map((r: any) => r.id)).toContain("tst1087da");
  });

  it("returns donations with no fund allocation row", async () => {
    const rows = await new DonationRepo().loadByPersonId(CHURCH_ID, PERSON_ID);
    expect(rows.map((r: any) => r.id)).toContain("tst1087db");
  });

  it("stays scoped to the church", async () => {
    const rows = await new DonationRepo().loadByPersonId("tst1087other", PERSON_ID);
    expect(rows).toHaveLength(0);
  });
});

async function cleanup() {
  await sql`DELETE FROM fundDonations WHERE churchId = ${CHURCH_ID}`.execute(db);
  await sql`DELETE FROM donations WHERE churchId = ${CHURCH_ID}`.execute(db);
  await sql`DELETE FROM funds WHERE churchId = ${CHURCH_ID}`.execute(db);
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
