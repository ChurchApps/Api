import "reflect-metadata";
import express from "express";

jest.mock("../GivingBaseController.js", () => ({ GivingBaseController: class { public repos: unknown; } }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { edit: "e", view: "v" } } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { appEnv: "dev", membershipApi: "http://test" } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: { sendTemplatedEmail: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, CurrencyHelper: { formatCurrencyWithLocale: (a: number) => String(a) }, EncryptionHelper: {} }));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

const gatewayService = {
  getGatewayForChurch: jest.fn(),
  getProviderCapabilities: jest.fn(),
  prepareSubscription: jest.fn(),
  createSubscription: jest.fn(),
  finalizeSubscription: jest.fn(),
  updateSubscription: jest.fn(),
  verifySubscriptionOwnership: jest.fn()
};
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({ GatewayService: gatewayService }));

import { DonateController } from "../DonateController.js";
import { SubscriptionController } from "../SubscriptionController.js";
import { SubscribeRequest, SubscriptionUpdateRequest } from "../types.js";

type Au = { id?: string; personId?: string; churchId: string; checkAccess: () => boolean };
const au: Au = { id: "U1", personId: "PER1", churchId: "CHU1", checkAccess: () => true };
const gateway = { id: "GAT1", churchId: "CHU1", provider: "stripe", currency: "usd" };

const wire = <T extends object>(controller: T, repos: Record<string, unknown>, extra: Record<string, unknown> = {}) => Object.assign(controller, {
  repos,
  actionWrapper: (_req: express.Request, _res: express.Response, action: (a: Au) => unknown) => action(au),
  json: (obj: unknown, status: number) => ({ obj, status }),
  ...extra
});

beforeEach(() => {
  Object.values(gatewayService).forEach((fn) => fn.mockReset());
  gatewayService.getGatewayForChurch.mockResolvedValue(gateway);
  gatewayService.getProviderCapabilities.mockReturnValue({ supportsSubscriptions: true });
  gatewayService.createSubscription.mockResolvedValue({ success: true, subscriptionId: "sub_1", data: { status: "active" } });
  gatewayService.finalizeSubscription.mockResolvedValue("cus_1");
  gatewayService.updateSubscription.mockResolvedValue({ id: "sub_1" });
});

describe("subscription.created fires once per new recurring gift", () => {
  it("saves a new subscription with its funds, amount and frequency in one call", async () => {
    const save = jest.fn(async (s: unknown) => s);
    const controller = wire(new DonateController(), { subscription: { save }, subscriptionFunds: { save: jest.fn() } }, {
      getGateway: async () => gateway,
      validateFundIds: async (): Promise<null> => null,
      savedMethodAllowed: async () => true,
      receiptContext: async (): Promise<null> => null
    });
    const interval = { interval_count: 1, interval: "month" };
    const body = {
      provider: "stripe",
      churchId: "CHU1",
      amount: 30,
      id: "pm_1",
      customerId: "cus_1",
      type: "card",
      interval,
      funds: [{ id: "FUN1", amount: 20 }, { id: "FUN2", amount: 10 }],
      person: { id: "PER1", email: "donor@example.com", name: "Donald Clark" }
    } as unknown as SubscribeRequest;

    await controller.subscribe({ body } as express.Request<{}, {}, SubscribeRequest>, {} as express.Response);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_1", churchId: "CHU1", personId: "PER1", customerId: "cus_1", amount: 30, interval }),
      [{ fundId: "FUN1", amount: 20 }, { fundId: "FUN2", amount: 10 }]
    );
  });

  it("never saves (so never fires) when an existing subscription is updated", async () => {
    const save = jest.fn();
    const controller = wire(new SubscriptionController(), {
      subscription: { save, load: jest.fn(async () => ({ id: "sub_1", churchId: "CHU1", personId: "PER1", customerId: "cus_1" })) },
      customer: { load: jest.fn() },
      gateway: {}
    });
    const body = [{ id: "sub_1", provider: "stripe", plan: { amount: 5000 } }] as unknown as SubscriptionUpdateRequest[];

    await controller.save({ body } as express.Request<{}, {}, SubscriptionUpdateRequest[]>, {} as express.Response);

    expect(gatewayService.updateSubscription).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});
