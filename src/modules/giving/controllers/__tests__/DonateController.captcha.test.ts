import "reflect-metadata";
import express from "express";

const env = { appEnv: "dev", membershipApi: "http://test", jwtSecret: "test-secret", captchaEnforce: true, googleRecaptchaSecretKey: "k", isDevLikeEnvironment: () => false };
jest.mock("../GivingBaseController.js", () => ({ GivingBaseController: class { public repos: unknown; } }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { edit: "e", view: "v" } } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: env }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: { sendTemplatedEmail: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, CurrencyHelper: { formatCurrencyWithLocale: (a: number) => String(a) } }));
const axios = { post: jest.fn(), get: jest.fn() };
jest.mock("axios", () => ({ __esModule: true, default: axios }));

const gatewayService = {
  getGatewayForChurch: jest.fn(),
  getProviderCapabilities: jest.fn(),
  createOrder: jest.fn(),
  createSubscription: jest.fn(),
  prepareCharge: jest.fn(),
  processCharge: jest.fn(),
  logsDonationsImmediately: jest.fn(),
  getCustomerCreatedAt: jest.fn()
};
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({ GatewayService: gatewayService }));
jest.mock("../../helpers/DonationRateLimiter.js", () => ({ DonationRateLimiter: { allow: jest.fn(async () => true), recordDecline: jest.fn() } }));

import { DonateController } from "../DonateController.js";
import { ChargeRequest } from "../types.js";

type Au = { id?: string; personId?: string; churchId: string; checkAccess: () => boolean };
type Result = { obj?: { error?: string }; status?: number; response?: string; pass?: string };

const guest: Au = { churchId: "", checkAccess: () => false };
const signedIn: Au = { id: "U1", personId: "PER1", churchId: "CHU1", checkAccess: () => false };

function makeController(au: Au = guest) {
  const controller = new DonateController();
  Object.assign(controller, {
    repos: { gateway: {}, fund: { load: jest.fn(async (_c: string, id: string) => ({ id })) }, customer: { load: jest.fn() } },
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: Au) => unknown) => action(au),
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action(),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return controller;
}

// Each endpoint posts a body and resolves to the handler's result.
const call = async (action: (req: express.Request, res: express.Response) => Promise<unknown>, body: unknown) => (await action({ body } as express.Request, {} as express.Response)) as Result;
const charge = (controller: DonateController, body: ChargeRequest) => call((req, res) => controller.charge(req, res), body);
const captchaVerify = (body: unknown) => {
  const controller = makeController();
  return call((req, res) => controller.captchaVerify(req, res), body);
};

const chargeBody = (extra: Partial<ChargeRequest> = {}): ChargeRequest => ({
  provider: "stripe",
  churchId: "CHU1",
  amount: 25,
  id: "pm_1",
  type: "card",
  funds: [{ id: "FUN1", amount: 25 }],
  person: { id: "", email: "donor@example.com", name: "Donald Clark" },
  ...extra
});

async function getPass(churchId = "CHU1") {
  axios.post.mockResolvedValue({ data: { success: true, hostname: "grace.b1.church" } });
  const result = await captchaVerify({ token: "t", churchId });
  return result.pass;
}

beforeEach(() => {
  env.captchaEnforce = true;
  Object.values(gatewayService).forEach((fn) => fn.mockReset());
  gatewayService.getGatewayForChurch.mockResolvedValue({ id: "GAT1", churchId: "CHU1", provider: "stripe", currency: "usd" });
  gatewayService.getProviderCapabilities.mockReturnValue({ supportsOrders: true, supportsSubscriptions: true });
  gatewayService.createOrder.mockResolvedValue({ id: "ORD1", status: "CREATED" });
  gatewayService.getCustomerCreatedAt.mockResolvedValue(new Date());
  gatewayService.processCharge.mockResolvedValue({ success: true, data: { id: "pi_1", status: "succeeded" } });
  gatewayService.logsDonationsImmediately.mockReturnValue(false);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("DonateController captcha gate for guest gifts", () => {
  it("hands out a signed pass when Google says the giver is human", async () => {
    const pass = await getPass();
    expect(typeof pass).toBe("string");
    expect(pass.split(".")).toHaveLength(2);
  });

  it("hands out no pass to a robot", async () => {
    axios.post.mockResolvedValue({ data: { success: false } });
    const result = await captchaVerify({ token: "t", churchId: "CHU1" });
    expect(result.response).toBe("robot");
    expect(result.pass).toBeUndefined();
  });

  it("sends the token to Google as one encoded value", async () => {
    axios.post.mockResolvedValue({ data: { success: false } });
    await captchaVerify({ token: "t&secret=other", churchId: "CHU1" });
    const url = new URL(axios.post.mock.calls[axios.post.mock.calls.length - 1][0]);
    expect(url.searchParams.getAll("secret")).toEqual(["k"]);
    expect(url.searchParams.get("response")).toBe("t&secret=other");
  });

  it("calls a token that is not a string a robot without asking Google", async () => {
    axios.post.mockClear();
    const result = await captchaVerify({ token: { a: 1 }, churchId: "CHU1" });
    expect(result.response).toBe("robot");
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("refuses a guest charge with no captcha pass", async () => {
    const result = await charge(makeController(), chargeBody());
    expect(result.status).toBe(403);
    expect(result.obj.error).toBe("Captcha verification required");
    expect(gatewayService.processCharge).not.toHaveBeenCalled();
  });

  it("charges a guest who passed the captcha, without forwarding the pass", async () => {
    const pass = await getPass();
    await charge(makeController(), chargeBody({ captchaPass: pass }));
    expect(gatewayService.processCharge).toHaveBeenCalled();
    expect(gatewayService.processCharge.mock.calls[0][1].captchaPass).toBeUndefined();
  });

  it("refuses a pass issued for a different church", async () => {
    const pass = await getPass("CHU2");
    const result = await charge(makeController(), chargeBody({ captchaPass: pass }));
    expect(result.status).toBe(403);
  });

  it("refuses a guest PayPal order with no captcha pass", async () => {
    const controller = makeController();
    const result = await call((req, res) => controller.createOrder(req, res), { churchId: "CHU1", provider: "paypal", amount: 25 });
    expect(result.status).toBe(403);
    expect(gatewayService.createOrder).not.toHaveBeenCalled();
  });

  it("refuses a guest subscription with no captcha pass", async () => {
    const controller = makeController();
    const result = await call((req, res) => controller.subscribe(req, res), { ...chargeBody(), interval: "month" });
    expect(result.status).toBe(403);
    expect(gatewayService.createSubscription).not.toHaveBeenCalled();
  });

  it("does not ask signed-in givers for a captcha", async () => {
    await charge(makeController(signedIn), chargeBody({ person: { id: "PER1", email: "d@example.com" } }));
    expect(gatewayService.processCharge).toHaveBeenCalled();
  });

  it("changes nothing while CAPTCHA_ENFORCE is off", async () => {
    env.captchaEnforce = false;
    await charge(makeController(), chargeBody());
    expect(gatewayService.processCharge).toHaveBeenCalled();
  });
});
