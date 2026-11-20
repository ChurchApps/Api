import "reflect-metadata";
import express from "express";

jest.mock("../GivingBaseController.js", () => ({ GivingBaseController: class { public repos: unknown; json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("@churchapps/helpers", () => ({ CurrencyHelper: { convertAmount: (amount: number) => amount } }), { virtual: true });
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({ GatewayService: {} }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { viewSummary: "vs", view: "v", edit: "e", enter: "n" } } }));

import { DonationController } from "../DonationController.js";
import { Donation } from "../../models/index.js";

const save = (controller: DonationController, body: Donation[]) => controller.save({ body } as express.Request, {} as express.Response);

// Counting teams need to know who typed in a gift. The server stamps it from the signed-in person, so a client can't name someone else.
function make() {
  const repos = {
    donation: {
      save: jest.fn(async (d: Donation) => d),
      convertAllToModel: (_c: string, d: Donation[]) => d
    }
  };
  const au = { id: "U1", churchId: "c1", personId: "p1", checkAccess: (p: string) => p === "e" };
  const controller = new DonationController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("POST /donations enteredBy", () => {
  it("stamps a new gift with the signed-in person", async () => {
    const { controller, repos } = make();
    await save(controller, [{ batchId: "b1", amount: 10 }]);
    expect(repos.donation.save.mock.calls[0][0].enteredBy).toBe("p1");
  });

  it("replaces a client-sent enteredBy on a new gift", async () => {
    const { controller, repos } = make();
    await save(controller, [{ batchId: "b1", amount: 10, enteredBy: "someoneElse" }]);
    expect(repos.donation.save.mock.calls[0][0].enteredBy).toBe("p1");
  });

  it("does not pass enteredBy to the repo when editing a gift", async () => {
    const { controller, repos } = make();
    await save(controller, [{ id: "d1", batchId: "b1", amount: 20, enteredBy: "someoneElse" }]);
    expect(repos.donation.save.mock.calls[0][0]).not.toHaveProperty("enteredBy");
  });
});
