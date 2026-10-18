import "reflect-metadata";

jest.mock("../GivingBaseController.js", () => ({ GivingBaseController: class { public repos: any; json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("@churchapps/helpers", () => ({ CurrencyHelper: { convertAmount: (amount: number) => amount } }), { virtual: true });
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({ GatewayService: {} }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { viewSummary: "vs", view: "v", edit: "e", enter: "n" } } }));

import { DonationController } from "../DonationController.js";
import { DonationBatchController } from "../DonationBatchController.js";
import { FundDonationController } from "../FundDonationController.js";

const batches: Record<string, any> = {
  open: { id: "open", name: "Sunday", status: "open" },
  closed: { id: "closed", name: "Last week", status: "closed" },
  legacy: { id: "legacy", name: "Before status existed", status: null }
};
const donations: Record<string, any> = {
  inOpen: { id: "inOpen", batchId: "open" },
  inClosed: { id: "inClosed", batchId: "closed" },
  online: { id: "online", batchId: "open", transactionId: "pi_123" }
};
const fundDonations: Record<string, any> = { fdClosed: { id: "fdClosed", donationId: "inClosed" }, fdOpen: { id: "fdOpen", donationId: "inOpen" } };

function makeRepos() {
  return {
    donationBatch: {
      load: jest.fn(async (_c: string, id: string) => batches[id] ?? null),
      save: jest.fn(async (b: any) => b),
      delete: jest.fn(),
      setStatus: jest.fn(),
      convertToModel: (_c: string, d: any) => d,
      convertAllToModel: (_c: string, d: any[]) => d
    },
    donation: {
      load: jest.fn(async (_c: string, id: string) => donations[id] ?? null),
      save: jest.fn(async (d: any) => d),
      delete: jest.fn(),
      deleteByBatchId: jest.fn(),
      convertAllToModel: (_c: string, d: any[]) => d
    },
    fundDonation: {
      load: jest.fn(async (_c: string, id: string) => fundDonations[id] ?? null),
      save: jest.fn(async (d: any) => d),
      delete: jest.fn(),
      convertToModel: (_c: string, d: any) => d
    }
  };
}

function make<T>(Ctor: new () => T, permissions: string[]) {
  const repos = makeRepos();
  const controller: any = new (Ctor as any)();
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action({ id: "U1", churchId: "c1", checkAccess: (p: string) => permissions.includes(p) });
  controller.json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

const ENTER = ["n", "v"];
const EDIT = ["e", "v", "vs"];

describe("Enter Donations permission", () => {
  it("adds a donation to an open batch", async () => {
    const { controller, repos } = make(DonationController, ENTER);
    await controller.save({ body: [{ batchId: "open", amount: 20 }] }, {});
    expect(repos.donation.save).toHaveBeenCalledTimes(1);
  });

  it("treats a batch saved before batches had a status as open", async () => {
    const { controller, repos } = make(DonationController, ENTER);
    await controller.save({ body: [{ batchId: "legacy", amount: 20 }] }, {});
    expect(repos.donation.save).toHaveBeenCalledTimes(1);
  });

  it("fixes and deletes a donation while its batch is open", async () => {
    const { controller, repos } = make(DonationController, ENTER);
    await controller.save({ body: [{ id: "inOpen", batchId: "open", amount: 25 }] }, {});
    await controller.delete("inOpen", {}, {});
    expect(repos.donation.save).toHaveBeenCalledTimes(1);
    expect(repos.donation.delete).toHaveBeenCalledWith("c1", "inOpen");
  });

  it("cannot add, change, move or delete donations in a closed batch", async () => {
    const { controller, repos } = make(DonationController, ENTER);
    expect((await controller.save({ body: [{ batchId: "closed", amount: 20 }] }, {})).status).toBe(403);
    expect((await controller.save({ body: [{ id: "inClosed", batchId: "closed", amount: 1 }] }, {})).status).toBe(403);
    expect((await controller.save({ body: [{ id: "inClosed", batchId: "open", amount: 1 }] }, {})).status).toBe(403);
    expect((await controller.save({ body: [{ id: "inOpen", batchId: "closed", amount: 1 }] }, {})).status).toBe(403);
    expect((await controller.delete("inClosed", {}, {})).status).toBe(403);
    expect(repos.donation.save).not.toHaveBeenCalled();
    expect(repos.donation.delete).not.toHaveBeenCalled();
  });

  it("cannot change gifts that came through a payment gateway", async () => {
    const { controller, repos } = make(DonationController, ENTER);
    expect((await controller.save({ body: [{ id: "online", batchId: "open", amount: 1 }] }, {})).status).toBe(403);
    expect((await controller.delete("online", {}, {})).status).toBe(403);
    expect(repos.donation.save).not.toHaveBeenCalled();
  });

  it("cannot change fund splits of a donation in a closed batch", async () => {
    const { controller, repos } = make(FundDonationController, ENTER);
    expect((await controller.save({ body: [{ donationId: "inClosed", fundId: "f1", amount: 5 }] }, {})).status).toBe(403);
    expect((await controller.delete("fdClosed", {}, {})).status).toBe(403);
    await controller.save({ body: [{ donationId: "inOpen", fundId: "f1", amount: 5 }] }, {});
    await controller.delete("fdOpen", {}, {});
    expect(repos.fundDonation.save).toHaveBeenCalledTimes(1);
    expect(repos.fundDonation.delete).toHaveBeenCalledWith("c1", "fdOpen");
  });

  it("creates and renames open batches but not closed ones, and cannot close or delete them", async () => {
    const { controller, repos } = make(DonationBatchController, ENTER);
    await controller.save({ body: [{ name: "Sunday cash" }] }, {});
    await controller.save({ body: [{ id: "open", name: "Sunday 2" }] }, {});
    expect((await controller.save({ body: [{ id: "closed", name: "Changed" }] }, {})).status).toBe(403);
    expect(repos.donationBatch.save).toHaveBeenCalledTimes(2);
    expect((await controller.close("open", {}, {})).status).toBe(401);
    expect((await controller.delete("open", {}, {})).status).toBe(401);
    expect(repos.donationBatch.setStatus).not.toHaveBeenCalled();
  });

  it("can see batches so it can pick one", async () => {
    const { controller } = make(DonationBatchController, ["n"]);
    controller.loadChurchRates = jest.fn(async () => ({ currency: "usd", rates: {} }));
    controller.repos.donationBatch.loadAmountsByCurrency = jest.fn(async () => new Map());
    const result = await controller.get("open", {}, {});
    expect(result).toEqual(expect.objectContaining({ id: "open", status: "open" }));
  });

  it("is denied without Enter or Edit Donations", async () => {
    const { controller, repos } = make(DonationController, ["v"]);
    expect((await controller.save({ body: [{ batchId: "open", amount: 20 }] }, {})).status).toBe(401);
    expect(repos.donation.save).not.toHaveBeenCalled();
  });
});

describe("Closing a batch", () => {
  it("Edit Donations closes and reopens a batch", async () => {
    const { controller, repos } = make(DonationBatchController, EDIT);
    await controller.close("open", {}, {});
    expect(repos.donationBatch.setStatus).toHaveBeenCalledWith("c1", "open", "closed", "U1");
    await controller.reopen("closed", {}, {});
    expect(repos.donationBatch.setStatus).toHaveBeenCalledWith("c1", "closed", "open", "U1");
  });

  it("Edit Donations can still change donations in a closed batch", async () => {
    const { controller, repos } = make(DonationController, EDIT);
    await controller.save({ body: [{ id: "inClosed", batchId: "closed", amount: 1 }] }, {});
    await controller.delete("inClosed", {}, {});
    expect(repos.donation.save).toHaveBeenCalledTimes(1);
    expect(repos.donation.delete).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when closing a batch that does not exist", async () => {
    const { controller, repos } = make(DonationBatchController, EDIT);
    expect((await controller.close("missing", {}, {})).status).toBe(404);
    expect(repos.donationBatch.setStatus).not.toHaveBeenCalled();
  });
});
