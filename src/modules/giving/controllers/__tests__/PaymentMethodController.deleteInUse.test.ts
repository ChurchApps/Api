import "reflect-metadata";
import express from "express";

jest.mock("../GivingBaseController", () => ({ GivingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { edit: "donationsEdit", view: "donationsView" } } }));
jest.mock("../../helpers/DonationRateLimiter.js", () => ({ DonationRateLimiter: {} }));
jest.mock("../../../../shared/helpers/CaptchaPass.js", () => ({ CaptchaPass: {} }));
jest.mock("../../models/index.js", () => ({}));
jest.mock("@churchapps/apihelper", () => ({}));
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({
  GatewayService: {
    inferProviderFromMethodId: jest.fn(() => "stripe"),
    getGatewayForChurch: jest.fn(async () => ({ id: "GAT1", provider: "stripe", churchId: "CHU1" })),
    verifyMethodOwnership: jest.fn(async () => true),
    activeSubscriptionIdsUsingMethod: jest.fn(async (): Promise<string[] | null> => []),
    deletePaymentMethod: jest.fn(async () => undefined)
  }
}));

import { PaymentMethodController } from "../PaymentMethodController.js";
import { GatewayService } from "../../../../shared/helpers/GatewayService.js";

type JsonResult = { obj: { code?: string; error?: string }; status: number };

// A member (no donations.edit) who owns customer cus_mine.
function makeController(customers: Record<string, { personId: string }> = { cus_mine: { personId: "PER1" } }) {
  const controller = new PaymentMethodController();
  const au = { churchId: "CHU1", personId: "PER1", checkAccess: () => false };
  Object.assign(controller, {
    repos: {
      customer: {
        load: jest.fn(async (_churchId: string, id: string) => customers[id] ? { id, ...customers[id] } : null),
        convertToModel: (_churchId: string, data: unknown) => data
      },
      gatewayPaymentMethod: { loadByExternalIdAcrossGateways: jest.fn() },
      gateway: { loadAll: jest.fn(async () => []) }
    },
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return controller;
}

const del = async (controller: PaymentMethodController, pmId = "pm_1", customerId = "cus_mine") =>
  (await controller.deletePaymentMethod(pmId, customerId, { query: {} } as unknown as express.Request<{}, {}, null>, {} as express.Response)) as JsonResult;

describe("PaymentMethodController delete with recurring gifts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GatewayService.activeSubscriptionIdsUsingMethod as jest.Mock).mockResolvedValue([]);
  });

  it("blocks deleting a method a recurring gift is charged to", async () => {
    (GatewayService.activeSubscriptionIdsUsingMethod as jest.Mock).mockResolvedValue(["sub_1"]);
    const result = await del(makeController());
    expect(result.status).toBe(409);
    expect(result.obj.code).toBe("payment_method_in_use");
    expect(result.obj.error).toMatch(/recurring gift/);
    expect(GatewayService.deletePaymentMethod).not.toHaveBeenCalled();
  });

  it("deletes a method no recurring gift uses", async () => {
    const result = await del(makeController());
    expect(result.status).toBeUndefined();
    expect(GatewayService.activeSubscriptionIdsUsingMethod).toHaveBeenCalledWith(expect.objectContaining({ id: "GAT1" }), "pm_1", "cus_mine");
    expect(GatewayService.deletePaymentMethod).toHaveBeenCalledWith(expect.objectContaining({ id: "GAT1" }), "pm_1", "cus_mine", expect.anything());
  });

  it("only checks the caller's own customer, so another person's gift can't block the delete", async () => {
    (GatewayService.activeSubscriptionIdsUsingMethod as jest.Mock).mockImplementation(async (_gw: unknown, _pm: string, customerId: string) => customerId === "cus_other" ? ["sub_other"] : []);
    const result = await del(makeController({ cus_mine: { personId: "PER1" }, cus_other: { personId: "PER2" } }));
    expect(result.status).toBeUndefined();
    expect(GatewayService.deletePaymentMethod).toHaveBeenCalled();
  });

  it("keeps the old behavior when the gateway can't say which method a gift uses", async () => {
    (GatewayService.activeSubscriptionIdsUsingMethod as jest.Mock).mockResolvedValue(null);
    expect((await del(makeController())).status).toBeUndefined();
    expect(GatewayService.deletePaymentMethod).toHaveBeenCalled();
  });

  it("keeps the old behavior when the recurring-gift lookup fails", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    (GatewayService.activeSubscriptionIdsUsingMethod as jest.Mock).mockRejectedValue(new Error("gateway down"));
    expect((await del(makeController())).status).toBeUndefined();
    expect(GatewayService.deletePaymentMethod).toHaveBeenCalled();
  });

  it("still refuses a customer the caller doesn't own before checking gifts", async () => {
    const result = await del(makeController({ cus_other: { personId: "PER2" } }), "pm_1", "cus_other");
    expect(result.status).toBe(401);
    expect(GatewayService.activeSubscriptionIdsUsingMethod).not.toHaveBeenCalled();
  });
});
