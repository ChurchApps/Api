import "reflect-metadata";

jest.mock("../GivingBaseController", () => ({ GivingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { edit: "donationsEdit" } } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { membershipApi: "http://membership" } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("../../models/index.js", () => ({}));
jest.mock("@churchapps/apihelper", () => ({ CurrencyHelper: {} }));
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({
  GatewayService: {
    getGatewayForChurch: jest.fn(async () => ({ id: "GAT1", provider: "Stripe", churchId: "CHU1" })),
    registerPaymentMethodDomain: jest.fn(async () => ({ id: "pmd_1", created: true }))
  }
}));

import Axios from "axios";
import { DonateController } from "../DonateController.js";
import { GatewayService } from "../../../../shared/helpers/GatewayService.js";

const axiosGet = Axios.get as unknown as jest.Mock;

function makeController() {
  const controller = new DonateController();
  (controller as any).repos = { gateway: {} };
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  (DonateController as any).registeredDomains.clear();
  return controller;
}

function mockLookups(opts: { subDomain?: string; domainChurchId?: string } = {}) {
  axiosGet.mockImplementation(async (url: string) => {
    if (url.includes("/churches/lookup/")) return { data: { id: "CHU1", subDomain: opts.subDomain ?? "grace" } };
    if (url.includes("/domains/public/owner/")) return { data: { owned: !!opts.domainChurchId && url.includes("churchId=" + opts.domainChurchId) } };
    throw new Error("unexpected url " + url);
  });
}

const post = (controller: DonateController, body: any) => (controller as any).registerDomain({ body }, {});

describe("DonateController register-domain", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GatewayService.registerPaymentMethodDomain as jest.Mock).mockResolvedValue({ id: "pmd_1", created: true });
    (GatewayService.getGatewayForChurch as jest.Mock).mockResolvedValue({ id: "GAT1", provider: "Stripe", churchId: "CHU1" });
  });

  it("rejects a domain that belongs to no church", async () => {
    mockLookups({ domainChurchId: undefined });
    const result: any = await post(makeController(), { churchId: "CHU1", domain: "evil.example.com" });
    expect(result.status).toBe(400);
    expect(GatewayService.registerPaymentMethodDomain).not.toHaveBeenCalled();
  });

  it("rejects a domain registered to a different church", async () => {
    mockLookups({ domainChurchId: "CHU2" });
    const result: any = await post(makeController(), { churchId: "CHU1", domain: "other-church.org" });
    expect(result.status).toBe(400);
    expect(GatewayService.registerPaymentMethodDomain).not.toHaveBeenCalled();
  });

  it("registers the church's own b1.church subdomain", async () => {
    mockLookups();
    const result: any = await post(makeController(), { churchId: "CHU1", domain: "https://grace.b1.church/donate" });
    expect(result).toEqual({ registered: true, created: true });
    expect(GatewayService.registerPaymentMethodDomain).toHaveBeenCalledWith(expect.objectContaining({ id: "GAT1" }), "grace.b1.church");
  });

  it("registers a custom domain owned by the church", async () => {
    mockLookups({ domainChurchId: "CHU1" });
    const result: any = await post(makeController(), { churchId: "CHU1", domain: "gracechurch.org" });
    expect(result).toEqual({ registered: true, created: true });
  });

  it("does not call the gateway twice for the same church and domain", async () => {
    mockLookups();
    const controller = makeController();
    await post(controller, { churchId: "CHU1", domain: "grace.b1.church" });
    const second: any = await post(controller, { churchId: "CHU1", domain: "grace.b1.church" });
    expect(second).toEqual({ registered: true, created: false });
    expect(GatewayService.registerPaymentMethodDomain).toHaveBeenCalledTimes(1);
  });

  it("skips the gateway round trip for local hosts", async () => {
    mockLookups();
    const result: any = await post(makeController(), { churchId: "CHU1", domain: "grace.localtest.me:3301" });
    expect(result).toEqual({ registered: false, reason: "local" });
    expect(GatewayService.registerPaymentMethodDomain).not.toHaveBeenCalled();
  });

  it("reports unsupported when the provider has no wallet domain hook", async () => {
    mockLookups();
    (GatewayService.registerPaymentMethodDomain as jest.Mock).mockResolvedValue(null);
    const result: any = await post(makeController(), { churchId: "CHU1", domain: "grace.b1.church" });
    expect(result).toEqual({ registered: false, reason: "unsupported" });
  });

  it("rejects a missing or malformed domain", async () => {
    mockLookups();
    const controller = makeController();
    expect((await post(controller, { churchId: "CHU1" }) as any).status).toBe(400);
    expect((await post(controller, { churchId: "CHU1", domain: "not a domain" }) as any).status).toBe(400);
  });
});
