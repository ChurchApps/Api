import "reflect-metadata";

type WhereChain = { where: () => WhereChain; execute: () => Promise<void> };
const inserted: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];
const db = {
  insertInto: () => ({ values: (v: Record<string, unknown>) => { inserted.push(v); return { execute: async () => {} }; } }),
  updateTable: () => ({ set: (v: Record<string, unknown>) => { updated.push(v); const chain: WhereChain = { where: () => chain, execute: async () => {} }; return chain; } })
};
jest.mock("../../db/index", () => ({ getDb: () => db }));
jest.mock("@churchapps/apihelper", () => ({
  __esModule: true,
  UniqueIdHelper: { shortId: () => "d1" },
  DateHelper: { toMysqlDate: (d: Date) => (d ? d.toISOString() : null) },
  ArrayHelper: { getOne: () => null }
}));
jest.mock("../../../../shared/webhooks/index", () => ({ __esModule: true, WebhookDispatcher: { emit: jest.fn() } }));

import { DonationRepo } from "../DonationRepo";

// The donor memo prints on statements; notes stay internal. Both must survive the round trip separately.
describe("DonationRepo memo", () => {
  const repo = new DonationRepo();

  it("writes memo and notes as separate columns on create", async () => {
    await repo.save({ churchId: "c1", amount: 10, donationDate: new Date("2026-11-08T12:00:00Z"), memo: "Youth trip", notes: "internal only" });
    expect(inserted[0]).toMatchObject({ memo: "Youth trip", notes: "internal only" });
  });

  it("writes memo on update", async () => {
    await repo.save({ id: "d1", churchId: "c1", amount: 10, donationDate: new Date("2026-11-08T12:00:00Z"), memo: "Benevolence", notes: "" });
    expect(updated[0]).toMatchObject({ memo: "Benevolence", notes: "" });
  });

  it("maps the memo column back onto the model", () => {
    const model = repo["rowToModel"]({ id: "d1", memo: "Youth trip", notes: "internal only" });
    expect(model.memo).toBe("Youth trip");
    expect(model.notes).toBe("internal only");
  });
});
