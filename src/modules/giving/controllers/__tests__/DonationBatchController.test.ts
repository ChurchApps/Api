import "reflect-metadata";
import express from "express";

jest.mock("../GivingBaseController.js", () => ({ GivingBaseController: class { public repos: unknown; json(obj: unknown, status: number) { return { obj, status }; } } }));
// Jest cannot load the ESM-only @churchapps/helpers build; same-currency totals need no conversion.
jest.mock("@churchapps/helpers", () => ({ CurrencyHelper: { convertAmount: (amount: number) => amount } }), { virtual: true });
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { viewSummary: "vs", edit: "e" } } }));

import { DonationBatchController } from "../DonationBatchController.js";
import { DonationBatch } from "../../models/index.js";

const get = (controller: DonationBatchController, id: string) => controller.get(id, {} as express.Request, {} as express.Response);

function makeController(batch: DonationBatch | null) {
  const repos = {
    donationBatch: {
      load: jest.fn(async () => batch),
      loadAmountsByCurrency: jest.fn(async () => new Map()),
      // Same field access as DonationBatchRepo.rowToModel, which throws on a null row.
      convertToModel: (_c: string, d: DonationBatch) => ({ id: d.id, name: d.name, batchDate: d.batchDate })
    }
  };
  const controller = new DonationBatchController();
  const au = { churchId: "c1", checkAccess: () => true };
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status }),
    loadChurchRates: jest.fn(async () => ({ currency: "usd", rates: {} }))
  });
  return { controller, repos };
}

describe("DonationBatchController.get", () => {
  it("returns 404 for a batch that does not exist", async () => {
    const { controller, repos } = makeController(null);
    const result = await get(controller, "missing");
    expect(result).toEqual({ obj: {}, status: 404 });
    expect(repos.donationBatch.loadAmountsByCurrency).not.toHaveBeenCalled();
  });

  it("returns an existing batch with its totals", async () => {
    const { controller } = makeController({ id: "b1", name: "Sunday", batchDate: new Date("2026-09-27") });
    const result = await get(controller, "b1");
    expect(result).toEqual(expect.objectContaining({ id: "b1", name: "Sunday", donationCount: 0 }));
  });
});
