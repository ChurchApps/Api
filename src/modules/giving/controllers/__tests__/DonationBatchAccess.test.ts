import "reflect-metadata";
import express from "express";

jest.mock("../GivingBaseController.js", () => ({ GivingBaseController: class { public repos: unknown; json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("@churchapps/helpers", () => ({ CurrencyHelper: { convertAmount: (amount: number) => amount } }), { virtual: true });
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({ GatewayService: {} }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { viewSummary: "vs", view: "v", edit: "e", enter: "n" } } }));

import { DonationController } from "../DonationController.js";
import { DonationBatchController } from "../DonationBatchController.js";
import { FundDonationController } from "../FundDonationController.js";
import { Donation, DonationBatch, FundDonation } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
const res = {} as express.Response;
const req = (body?: unknown) => ({ body } as express.Request);
const status = async (result: Promise<unknown>) => ((await result) as JsonResult).status;

const batches: Record<string, DonationBatch> = {
  open: { id: "open", name: "Sunday", status: "open" },
  closed: { id: "closed", name: "Last week", status: "closed" },
  legacy: { id: "legacy", name: "Before status existed", status: null }
};
const donations: Record<string, Donation> = {
  inOpen: { id: "inOpen", batchId: "open" },
  inClosed: { id: "inClosed", batchId: "closed" },
  online: { id: "online", batchId: "open", transactionId: "pi_123" }
};
const fundDonations: Record<string, FundDonation> = { fdClosed: { id: "fdClosed", donationId: "inClosed" }, fdOpen: { id: "fdOpen", donationId: "inOpen" } };

function makeRepos() {
  return {
    donationBatch: {
      load: jest.fn(async (_c: string, id: string) => batches[id] ?? null),
      save: jest.fn(async (b: DonationBatch) => b),
      delete: jest.fn(),
      setStatus: jest.fn(),
      convertToModel: (_c: string, d: DonationBatch) => d,
      convertAllToModel: (_c: string, d: DonationBatch[]) => d
    },
    donation: {
      load: jest.fn(async (_c: string, id: string) => donations[id] ?? null),
      save: jest.fn(async (d: Donation) => d),
      delete: jest.fn(),
      deleteByBatchId: jest.fn(),
      convertAllToModel: (_c: string, d: Donation[]) => d
    },
    fundDonation: {
      load: jest.fn(async (_c: string, id: string) => fundDonations[id] ?? null),
      save: jest.fn(async (d: FundDonation) => d),
      delete: jest.fn(),
      convertToModel: (_c: string, d: FundDonation) => d
    }
  };
}

function make<T extends object>(Ctor: new () => T, permissions: string[]) {
  const repos = makeRepos();
  const controller = new Ctor();
  const au = { id: "U1", churchId: "c1", checkAccess: (p: string) => permissions.includes(p) };
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

const ENTER = ["n", "v"];
const EDIT = ["e", "v", "vs"];

describe("Enter Donations permission", () => {
  it("adds a donation to an open batch", async () => {
    const { controller, repos } = make(DonationController, ENTER);
    await controller.save(req([{ batchId: "open", amount: 20 }]), res);
    expect(repos.donation.save).toHaveBeenCalledTimes(1);
  });

  it("treats a batch saved before batches had a status as open", async () => {
    const { controller, repos } = make(DonationController, ENTER);
    await controller.save(req([{ batchId: "legacy", amount: 20 }]), res);
    expect(repos.donation.save).toHaveBeenCalledTimes(1);
  });

  it("fixes and deletes a donation while its batch is open", async () => {
    const { controller, repos } = make(DonationController, ENTER);
    await controller.save(req([{ id: "inOpen", batchId: "open", amount: 25 }]), res);
    await controller.delete("inOpen", req(), res);
    expect(repos.donation.save).toHaveBeenCalledTimes(1);
    expect(repos.donation.delete).toHaveBeenCalledWith("c1", "inOpen");
  });

  it("cannot add, change, move or delete donations in a closed batch", async () => {
    const { controller, repos } = make(DonationController, ENTER);
    expect(await status(controller.save(req([{ batchId: "closed", amount: 20 }]), res))).toBe(403);
    expect(await status(controller.save(req([{ id: "inClosed", batchId: "closed", amount: 1 }]), res))).toBe(403);
    expect(await status(controller.save(req([{ id: "inClosed", batchId: "open", amount: 1 }]), res))).toBe(403);
    expect(await status(controller.save(req([{ id: "inOpen", batchId: "closed", amount: 1 }]), res))).toBe(403);
    expect(await status(controller.delete("inClosed", req(), res))).toBe(403);
    expect(repos.donation.save).not.toHaveBeenCalled();
    expect(repos.donation.delete).not.toHaveBeenCalled();
  });

  it("cannot change gifts that came through a payment gateway", async () => {
    const { controller, repos } = make(DonationController, ENTER);
    expect(await status(controller.save(req([{ id: "online", batchId: "open", amount: 1 }]), res))).toBe(403);
    expect(await status(controller.delete("online", req(), res))).toBe(403);
    expect(repos.donation.save).not.toHaveBeenCalled();
  });

  it("cannot change fund splits of a donation in a closed batch", async () => {
    const { controller, repos } = make(FundDonationController, ENTER);
    expect(await status(controller.save(req([{ donationId: "inClosed", fundId: "f1", amount: 5 }]), res))).toBe(403);
    expect(await status(controller.delete("fdClosed", req(), res))).toBe(403);
    await controller.save(req([{ donationId: "inOpen", fundId: "f1", amount: 5 }]), res);
    await controller.delete("fdOpen", req(), res);
    expect(repos.fundDonation.save).toHaveBeenCalledTimes(1);
    expect(repos.fundDonation.delete).toHaveBeenCalledWith("c1", "fdOpen");
  });

  it("creates and renames open batches but not closed ones, and cannot close or delete them", async () => {
    const { controller, repos } = make(DonationBatchController, ENTER);
    await controller.save(req([{ name: "Sunday cash" }]), res);
    await controller.save(req([{ id: "open", name: "Sunday 2" }]), res);
    expect(await status(controller.save(req([{ id: "closed", name: "Changed" }]), res))).toBe(403);
    expect(repos.donationBatch.save).toHaveBeenCalledTimes(2);
    expect(await status(controller.close("open", req(), res))).toBe(401);
    expect(await status(controller.delete("open", req(), res))).toBe(401);
    expect(repos.donationBatch.setStatus).not.toHaveBeenCalled();
  });

  it("can see batches so it can pick one", async () => {
    const { controller, repos } = make(DonationBatchController, ["n"]);
    Object.assign(controller, { loadChurchRates: jest.fn(async () => ({ currency: "usd", rates: {} })) });
    Object.assign(repos.donationBatch, { loadAmountsByCurrency: jest.fn(async () => new Map()) });
    const result = await controller.get("open", req(), res);
    expect(result).toEqual(expect.objectContaining({ id: "open", status: "open" }));
  });

  it("is denied without Enter or Edit Donations", async () => {
    const { controller, repos } = make(DonationController, ["v"]);
    expect(await status(controller.save(req([{ batchId: "open", amount: 20 }]), res))).toBe(401);
    expect(repos.donation.save).not.toHaveBeenCalled();
  });
});

describe("Closing a batch", () => {
  it("Edit Donations closes and reopens a batch", async () => {
    const { controller, repos } = make(DonationBatchController, EDIT);
    await controller.close("open", req(), res);
    expect(repos.donationBatch.setStatus).toHaveBeenCalledWith("c1", "open", "closed", "U1");
    await controller.reopen("closed", req(), res);
    expect(repos.donationBatch.setStatus).toHaveBeenCalledWith("c1", "closed", "open", "U1");
  });

  it("Edit Donations can still change donations in a closed batch", async () => {
    const { controller, repos } = make(DonationController, EDIT);
    await controller.save(req([{ id: "inClosed", batchId: "closed", amount: 1 }]), res);
    await controller.delete("inClosed", req(), res);
    expect(repos.donation.save).toHaveBeenCalledTimes(1);
    expect(repos.donation.delete).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when closing a batch that does not exist", async () => {
    const { controller, repos } = make(DonationBatchController, EDIT);
    expect(await status(controller.close("missing", req(), res))).toBe(404);
    expect(repos.donationBatch.setStatus).not.toHaveBeenCalled();
  });
});
