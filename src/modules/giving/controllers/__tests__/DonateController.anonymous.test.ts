import "reflect-metadata";
import express from "express";

jest.mock("../GivingBaseController.js", () => ({ GivingBaseController: class { public repos: unknown; } }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { edit: "e", view: "v" } } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { appEnv: "dev", membershipApi: "http://test" } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: { sendTemplatedEmail: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, CurrencyHelper: { formatCurrencyWithLocale: (a: number) => String(a) } }));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

const gatewayService = {
  getGatewayForChurch: jest.fn(),
  prepareCharge: jest.fn(),
  processCharge: jest.fn(),
  logsDonationsImmediately: jest.fn(),
  logEvent: jest.fn(),
  logDonation: jest.fn(),
  getCustomerCreatedAt: jest.fn()
};
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({ GatewayService: gatewayService }));
const rateLimiter = { allow: jest.fn(), recordDecline: jest.fn() };
jest.mock("../../helpers/DonationRateLimiter.js", () => ({ DonationRateLimiter: rateLimiter }));

import { DonateController } from "../DonateController.js";
import { ChargeRequest } from "../types.js";

type JsonResult = { obj: { error?: string }; status: number };
type Au = { id?: string; personId?: string; churchId: string; checkAccess: () => boolean };

function makeController(extraRepos: Record<string, unknown> = {}) {
  const controller = new DonateController();
  const au: Au = { churchId: "CHU1", checkAccess: () => true };
  Object.assign(controller, {
    repos: { gateway: {}, fund: { load: jest.fn(async (_c: string, id: string) => (id === "FUN1" ? { id } : null)) }, customer: { load: jest.fn() }, ...extraRepos },
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: Au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return controller;
}

const charge = async (controller: DonateController, body: ChargeRequest) => (await controller.charge({ body } as express.Request, {} as express.Response)) as JsonResult;

function chargeBody(extra: Partial<ChargeRequest> = {}): ChargeRequest {
  return {
    provider: "stripe",
    churchId: "CHU1",
    amount: 25,
    id: "pm_1",
    type: "card",
    funds: [{ id: "FUN1", amount: 25 }],
    person: { id: "PER1", email: "donor@example.com", name: "Donald Clark" },
    church: { name: "Grace", subDomain: "grace" },
    ...extra
  };
}

beforeEach(() => {
  Object.values(gatewayService).forEach((fn) => fn.mockReset());
  gatewayService.getGatewayForChurch.mockResolvedValue({ id: "GAT1", churchId: "CHU1", provider: "stripe", currency: "usd" });
  gatewayService.getCustomerCreatedAt.mockResolvedValue(new Date());
  rateLimiter.allow.mockReset().mockResolvedValue(true);
  rateLimiter.recordDecline.mockReset();
  gatewayService.processCharge.mockResolvedValue({ success: true, data: { id: "pi_1", status: "succeeded" } });
  gatewayService.logsDonationsImmediately.mockReturnValue(false);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("DonateController.charge anonymous gifts", () => {
  it("strips the donor identity so no person is attached to the gift", async () => {
    const controller = makeController();
    await charge(controller, chargeBody({ anonymous: true, customerId: "cus_1" }));

    const sent = gatewayService.processCharge.mock.calls[0][1];
    expect(sent.person).toEqual({ id: "", email: "donor@example.com", name: "" });
    expect(sent.anonymous).toBe(true);
  });

  it("keeps the donor identity on a normal gift", async () => {
    const controller = makeController();
    await charge(controller, chargeBody());

    const sent = gatewayService.processCharge.mock.calls[0][1];
    expect(sent.person).toEqual({ id: "PER1", email: "donor@example.com", name: "Donald Clark" });
  });

  it("tells providers that log immediately the gift is anonymous", async () => {
    gatewayService.logsDonationsImmediately.mockReturnValue(true);
    const controller = makeController();
    await charge(controller, chargeBody({ anonymous: true, provider: "paystack" }));

    const logged = gatewayService.logDonation.mock.calls[0][2];
    expect(logged.anonymous).toBe(true);
    expect(logged.person.id).toBe("");
    expect(logged.funds).toEqual([{ id: "FUN1", amount: 25 }]);
  });
});

describe("DonateController.charge guest safeguards", () => {
  it("refuses a Stripe customer the guest did not just create", async () => {
    gatewayService.getCustomerCreatedAt.mockResolvedValue(new Date(Date.now() - 3 * 60 * 60 * 1000));
    const result = await charge(makeController(), chargeBody({ customerId: "cus_victim" }));
    expect(result.status).toBe(403);
    expect(gatewayService.processCharge).not.toHaveBeenCalled();
  });

  it("accepts the customer minted moments ago by /addcard", async () => {
    await charge(makeController(), chargeBody({ customerId: "cus_new" }));
    expect(gatewayService.processCharge).toHaveBeenCalled();
  });

  it("returns 429 once the guest is rate limited", async () => {
    rateLimiter.allow.mockResolvedValue(false);
    const result = await charge(makeController(), chargeBody());
    expect(result.status).toBe(429);
    expect(gatewayService.processCharge).not.toHaveBeenCalled();
  });

  it("counts a declined guest charge", async () => {
    gatewayService.processCharge.mockResolvedValue({ success: false, data: { error: "declined" } });
    await charge(makeController(), chargeBody());
    expect(rateLimiter.recordDecline).toHaveBeenCalled();
  });

  it("rejects funds that are not in the church", async () => {
    const result = await charge(makeController(), chargeBody({ funds: [{ id: "OTHER", amount: 25 }] }));
    expect(result.status).toBe(400);
  });

  it("sends no receipt for a reference that was already recorded", async () => {
    gatewayService.processCharge.mockResolvedValue({ success: true, data: { status: "succeeded", alreadyRecorded: true } });
    const controller = makeController();
    const receiptContext = jest.fn();
    Object.assign(controller, { receiptContext });
    await charge(controller, chargeBody({ provider: "paystack", id: "ref_1" }));
    expect(receiptContext).not.toHaveBeenCalled();
  });
});

describe("DonateController.charge saved methods for signed-in donors", () => {
  const signedIn = (controller: DonateController) => {
    const au: Au = { id: "U1", personId: "PER1", churchId: "CHU1", checkAccess: () => false };
    return Object.assign(controller, { actionWrapper: (_req: express.Request, _res: express.Response, action: (a: Au) => unknown) => action(au) });
  };
  const vaultRepos = (personId: string) => ({
    gatewayPaymentMethod: { loadByExternalId: jest.fn().mockResolvedValue({ customerId: "V1" }) },
    customer: { load: jest.fn().mockResolvedValue({ id: "V1", personId }) }
  });

  it("refuses a Kingdom Funding vault that belongs to someone else", async () => {
    gatewayService.getGatewayForChurch.mockResolvedValue({ id: "GAT1", churchId: "CHU1", provider: "kingdomfunding", currency: "usd" });
    const controller = signedIn(makeController(vaultRepos("VICTIM")));
    const result = await charge(controller, chargeBody({ provider: "kingdomfunding", id: "123456" }));
    expect(result.status).toBe(403);
    expect(gatewayService.processCharge).not.toHaveBeenCalled();
  });

  it("charges the donor's own Kingdom Funding vault", async () => {
    gatewayService.getGatewayForChurch.mockResolvedValue({ id: "GAT1", churchId: "CHU1", provider: "kingdomfunding", currency: "usd" });
    const controller = signedIn(makeController(vaultRepos("PER1")));
    await charge(controller, chargeBody({ provider: "kingdomfunding", id: "123456" }));
    expect(gatewayService.processCharge).toHaveBeenCalled();
  });
});
