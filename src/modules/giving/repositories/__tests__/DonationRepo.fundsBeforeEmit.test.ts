import "reflect-metadata";

const calls: string[] = [];
const execute = jest.fn(async () => { calls.push("insert"); });
const db: any = { insertInto: () => ({ values: () => ({ execute }) }) };
jest.mock("../../db/index", () => ({ getDb: () => db }));
jest.mock("@churchapps/apihelper", () => ({
  __esModule: true,
  UniqueIdHelper: { shortId: jest.fn().mockReturnValueOnce("d1").mockReturnValue("fd") },
  DateHelper: { toMysqlDate: (d: Date) => d.toISOString() },
  ArrayHelper: { getOne: () => null }
}));
const emitMock = jest.fn(async () => { calls.push("emit"); });
jest.mock("../../../../shared/webhooks/index", () => ({ __esModule: true, WebhookDispatcher: { emit: emitMock } }));
const fundSaveMock = jest.fn(async (fd: any) => { calls.push("fund:" + fd.fundId); return { ...fd, id: "fd-" + fd.fundId }; });
jest.mock("../FundDonationRepo", () => ({ __esModule: true, FundDonationRepo: class { save = fundSaveMock; } }));

import { DonationRepo } from "../DonationRepo";

describe("DonationRepo.save with fund rows", () => {
  it("writes the fund rows before donation.created fires", async () => {
    const saved = await new DonationRepo().save(
      { churchId: "c1", personId: "p1", amount: 75, donationDate: new Date("2026-11-08T12:00:00Z"), method: "Check" },
      [{ fundId: "f1", amount: 50 }, { fundId: "f2", amount: 25 }]
    );

    expect(calls).toEqual(["insert", "fund:f1", "fund:f2", "emit"]);
    expect(fundSaveMock).toHaveBeenCalledWith({ churchId: "c1", donationId: "d1", fundId: "f1", amount: 50 });
    expect(emitMock).toHaveBeenCalledWith("c1", "donation.created", saved);
    expect(saved.id).toBe("d1");
  });
});
