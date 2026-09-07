import "reflect-metadata";

jest.mock("../GivingBaseController", () => ({ GivingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { edit: "donationsEdit" } } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { membershipApi: "http://membership" } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("../../helpers/DunningHelper.js", () => ({ DunningHelper: { notify: jest.fn() } }));
jest.mock("../../models/index.js", () => ({}));
jest.mock("@churchapps/apihelper", () => ({ CurrencyHelper: {} }));
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({
  GatewayService: {
    supportsRefund: jest.fn(() => true),
    refundDonation: jest.fn(async () => ({ success: true, refundId: "re_1" }))
  }
}));

import { DonateController } from "../DonateController.js";
import { GatewayService } from "../../../../shared/helpers/GatewayService.js";

const COMPLETE = { id: "DON1", status: "complete", transactionId: "pi_1" };

function makeController(donation: any, gateways: any[] = [{ id: "GAT1", provider: "Stripe" }], access = true) {
  const controller = new DonateController();
  const updateStatus = jest.fn();
  (controller as any).repos = {
    donation: { load: jest.fn(async () => donation), updateStatus },
    gateway: { loadAll: jest.fn(async () => gateways) }
  };
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "CHU1", checkAccess: () => access });
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, updateStatus };
}

const refund = (controller: DonateController, donationId = "DON1") => (controller as any).refund({ params: { donationId } }, {});

describe("DonateController refund", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GatewayService.supportsRefund as jest.Mock).mockReturnValue(true);
    (GatewayService.refundDonation as jest.Mock).mockResolvedValue({ success: true, refundId: "re_1" });
  });

  it("refunds a completed donation and marks the row refunded", async () => {
    const { controller, updateStatus } = makeController(COMPLETE);
    const result: any = await refund(controller);
    expect(GatewayService.refundDonation).toHaveBeenCalledWith(expect.objectContaining({ id: "GAT1" }), "pi_1");
    expect(updateStatus).toHaveBeenCalledWith("CHU1", "pi_1", "refunded");
    expect(result).toEqual({ success: true, refundId: "re_1" });
  });

  it("rejects a caller without donations.edit", async () => {
    const { controller } = makeController(COMPLETE, undefined, false);
    expect((await refund(controller) as any).status).toBe(401);
    expect(GatewayService.refundDonation).not.toHaveBeenCalled();
  });

  it("404s a donation that does not exist", async () => {
    const { controller } = makeController(null);
    expect((await refund(controller) as any).status).toBe(404);
  });

  it("refuses a donation that is not complete", async () => {
    const { controller, updateStatus } = makeController({ ...COMPLETE, status: "failed" });
    expect((await refund(controller) as any).status).toBe(400);
    expect(updateStatus).not.toHaveBeenCalled();
    expect(GatewayService.refundDonation).not.toHaveBeenCalled();
  });

  it("refuses a manually entered donation with no transaction id", async () => {
    const { controller } = makeController({ id: "DON1", status: "complete" });
    expect((await refund(controller) as any).status).toBe(400);
    expect(GatewayService.refundDonation).not.toHaveBeenCalled();
  });

  it("refuses when no configured gateway supports refunds", async () => {
    (GatewayService.supportsRefund as jest.Mock).mockReturnValue(false);
    const { controller } = makeController(COMPLETE);
    expect((await refund(controller) as any).status).toBe(400);
    expect(GatewayService.refundDonation).not.toHaveBeenCalled();
  });

  it("returns the gateway error and leaves the status alone when the refund fails", async () => {
    (GatewayService.refundDonation as jest.Mock).mockResolvedValue({ success: false, error: "Charge has already been refunded." });
    const { controller, updateStatus } = makeController(COMPLETE);
    const result: any = await refund(controller);
    expect(result.status).toBe(400);
    expect(result.obj).toEqual({ error: "Charge has already been refunded." });
    expect(updateStatus).not.toHaveBeenCalled();
  });
});
