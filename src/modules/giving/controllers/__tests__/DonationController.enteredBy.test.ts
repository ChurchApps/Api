import "reflect-metadata";

jest.mock("../GivingBaseController.js", () => ({ GivingBaseController: class { public repos: any; json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("@churchapps/helpers", () => ({ CurrencyHelper: { convertAmount: (amount: number) => amount } }), { virtual: true });
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({ GatewayService: {} }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { viewSummary: "vs", view: "v", edit: "e", enter: "n" } } }));

import { DonationController } from "../DonationController.js";

// Counting teams need to know who typed in a gift. The server stamps it from the signed-in person, so a client can't name someone else.
function make() {
  const repos: any = {
    donation: {
      save: jest.fn(async (d: any) => d),
      convertAllToModel: (_c: string, d: any[]) => d
    }
  };
  const controller: any = new DonationController();
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action({ id: "U1", churchId: "c1", personId: "p1", checkAccess: (p: string) => p === "e" });
  controller.json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("POST /donations enteredBy", () => {
  it("stamps a new gift with the signed-in person", async () => {
    const { controller, repos } = make();
    await controller.save({ body: [{ batchId: "b1", amount: 10 }] }, {});
    expect(repos.donation.save.mock.calls[0][0].enteredBy).toBe("p1");
  });

  it("replaces a client-sent enteredBy on a new gift", async () => {
    const { controller, repos } = make();
    await controller.save({ body: [{ batchId: "b1", amount: 10, enteredBy: "someoneElse" }] }, {});
    expect(repos.donation.save.mock.calls[0][0].enteredBy).toBe("p1");
  });

  it("does not pass enteredBy to the repo when editing a gift", async () => {
    const { controller, repos } = make();
    await controller.save({ body: [{ id: "d1", batchId: "b1", amount: 20, enteredBy: "someoneElse" }] }, {});
    expect(repos.donation.save.mock.calls[0][0]).not.toHaveProperty("enteredBy");
  });
});
