import "reflect-metadata";
import { getDb } from "../../db/index";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
// apihelper ships untransformed ESM; stub the only symbol EventLogRepo uses.
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "evt_generated" } }));

import { EventLogRepo, isDuplicateKeyError } from "../EventLogRepo";

const mockedGetDb = getDb as jest.Mock;

describe("isDuplicateKeyError", () => {
  it("matches MySQL errno 1062", () => expect(isDuplicateKeyError({ errno: 1062 })).toBe(true));
  it("matches ER_DUP_ENTRY code", () => expect(isDuplicateKeyError({ code: "ER_DUP_ENTRY" })).toBe(true));
  it("matches a duplicate-entry message", () =>
    expect(isDuplicateKeyError({ message: "Duplicate entry 'C1-pi_1' for key 'idx_eventLogs_church_provider'" })).toBe(true));
  it("does not match unrelated errors", () => {
    expect(isDuplicateKeyError({ errno: 1213, message: "Deadlock found" })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
  });
});

// Concurrent webhooks must be idempotent; 500 would trigger retry storm.
describe("EventLogRepo.create idempotency under the unique constraint", () => {
  const buildDb = (opts: { insertError?: any; existingRow?: any }) => ({
    insertInto: () => ({ values: () => ({ execute: () => (opts.insertError ? Promise.reject(opts.insertError) : Promise.resolve()) }) }),
    selectFrom: () => ({
      selectAll: () => {
        const chain: any = {
          where: () => chain,
          limit: () => chain,
          executeTakeFirst: () => Promise.resolve(opts.existingRow ?? null)
        };
        return chain;
      }
    })
  });

  afterEach(() => jest.restoreAllMocks());

  it("returns the winning row when a concurrent insert already claimed the event", async () => {
    const existing = { id: "evt_winner", churchId: "C1", providerId: "pi_1", resolved: false };
    mockedGetDb.mockReturnValue(buildDb({ insertError: { errno: 1062 }, existingRow: existing }));
    const repo = new EventLogRepo();
    const result = await (repo as any).create({ churchId: "C1", providerId: "pi_1", provider: "stripe", eventType: "charge.succeeded" });
    expect(result.id).toBe("evt_winner");
  });

  it("rethrows non-duplicate insert errors", async () => {
    mockedGetDb.mockReturnValue(buildDb({ insertError: { errno: 1213, message: "Deadlock found" } }));
    const repo = new EventLogRepo();
    await expect((repo as any).create({ churchId: "C1", providerId: "pi_2", provider: "stripe" })).rejects.toMatchObject({ errno: 1213 });
  });

  it("inserts normally when there is no conflict", async () => {
    mockedGetDb.mockReturnValue(buildDb({}));
    const repo = new EventLogRepo();
    const result = await (repo as any).create({ id: "evt_new", churchId: "C1", providerId: "pi_3", provider: "stripe" });
    expect(result.id).toBe("evt_new");
  });
});
