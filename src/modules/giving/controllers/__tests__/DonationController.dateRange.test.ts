import "reflect-metadata";
import express from "express";

jest.mock("../GivingBaseController.js", () => ({ GivingBaseController: class { public repos: unknown; json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("@churchapps/helpers", () => ({ CurrencyHelper: { convertAmount: (amount: number) => amount } }), { virtual: true });
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({ GatewayService: {} }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { viewSummary: "vs", view: "v", edit: "e", enter: "n" } } }));

import { DonationController } from "../DonationController.js";
import { Donation } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
const res = {} as express.Response;
const get = (controller: DonationController, query: express.Request["query"]) => controller.getAll({ query } as express.Request, res);

// Production: GET /giving/donations (no filter) loaded every donation the church ever recorded. For large churches the
// response passed Lambda's 6MB limit (LAMBDA_RUNTIME 413), so the giving statements pages, which only need one year, failed.
function make() {
  const repos = {
    donation: {
      loadAll: jest.fn(async () => [{ id: "all" }]),
      loadByDateRange: jest.fn(async () => [{ id: "year" }]),
      convertAllToModel: (_c: string, d: Donation[]) => d
    }
  };
  const au = { id: "U1", churchId: "c1", personId: "p1", checkAccess: (p: string) => p === "v" };
  const controller = new DonationController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("GET /donations date range", () => {
  it("loads only the requested dates when startDate and endDate are given", async () => {
    const { controller, repos } = make();
    const result = await get(controller, { startDate: "2026-01-01", endDate: "2026-12-31" });
    expect(repos.donation.loadAll).not.toHaveBeenCalled();
    expect(repos.donation.loadByDateRange).toHaveBeenCalledWith("c1", "2026-01-01", "2026-12-31");
    expect(result).toEqual([{ id: "year" }]);
  });

  it("still loads everything with no filter", async () => {
    const { controller } = make();
    expect(await get(controller, {})).toEqual([{ id: "all" }]);
  });

  it("answers 400 for a missing or unparseable date", async () => {
    const { controller, repos } = make();
    expect(((await get(controller, { startDate: "nope", endDate: "2026-12-31" })) as JsonResult).status).toBe(400);
    expect(((await get(controller, { startDate: "2026-01-01" })) as JsonResult).status).toBe(400);
    expect(repos.donation.loadAll).not.toHaveBeenCalled();
  });
});
