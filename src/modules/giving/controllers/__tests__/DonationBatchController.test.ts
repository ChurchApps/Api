import "reflect-metadata";

jest.mock("../GivingBaseController.js", () => ({ GivingBaseController: class { public repos: any; json(obj: any, status: number) { return { obj, status }; } } }));
// Jest cannot load the ESM-only @churchapps/helpers build; same-currency totals need no conversion.
jest.mock("@churchapps/helpers", () => ({ CurrencyHelper: { convertAmount: (amount: number) => amount } }), { virtual: true });
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { viewSummary: "vs", edit: "e" } } }));

import { DonationBatchController } from "../DonationBatchController.js";

function makeController(batch: any) {
  const repos: any = {
    donationBatch: {
      load: jest.fn(async () => batch),
      loadAmountsByCurrency: jest.fn(async () => new Map()),
      // Same field access as DonationBatchRepo.rowToModel, which throws on a null row.
      convertToModel: (_c: string, d: any) => ({ id: d.id, name: d.name, batchDate: d.batchDate })
    }
  };
  const controller = new DonationBatchController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", checkAccess: () => true });
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  (controller as any).loadChurchRates = jest.fn(async () => ({ currency: "usd", rates: {} }));
  return { controller, repos };
}

describe("DonationBatchController.get", () => {
  it("returns 404 for a batch that does not exist", async () => {
    const { controller, repos } = makeController(null);
    const result: any = await (controller as any).get("missing", {}, {});
    expect(result).toEqual({ obj: {}, status: 404 });
    expect(repos.donationBatch.loadAmountsByCurrency).not.toHaveBeenCalled();
  });

  it("returns an existing batch with its totals", async () => {
    const { controller } = makeController({ id: "b1", name: "Sunday", batchDate: "2026-09-27" });
    const result: any = await (controller as any).get("b1", {}, {});
    expect(result).toEqual(expect.objectContaining({ id: "b1", name: "Sunday", donationCount: 0 }));
  });
});
