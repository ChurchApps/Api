import "reflect-metadata";

jest.mock("../GivingBaseController", () => ({ GivingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { edit: "donationsEdit" } } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { membershipApi: "http://membership" } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("../../helpers/DunningHelper.js", () => ({ DunningHelper: { notify: jest.fn() } }));
jest.mock("../../models/index.js", () => ({}));
jest.mock("@churchapps/apihelper", () => ({ CurrencyHelper: {} }));
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../../../../shared/helpers/GatewayService.js", () => {
  const { StripeHelper } = jest.requireActual("../../../../shared/helpers/StripeHelper");
  return {
    GatewayService: {
      getProviderFromGateway: jest.fn(() => ({ capabilities: { supportsWebhooks: true } })),
      verifyWebhook: jest.fn(),
      classifyWebhookEvent: jest.fn(() => ({ action: "donation", status: "complete" })),
      logEvent: jest.fn(),
      logDonation: (_gateway: any, churchId: string, eventData: any, repos: any, status: any) => StripeHelper.logDonation("sk_test", churchId, eventData, repos, status),
      updateDonationStatus: (_gateway: any, churchId: string, transactionId: string, status: any, repos: any) => StripeHelper.updateDonationStatus(churchId, transactionId, status, repos)
    }
  };
});

import { DonateController } from "../DonateController.js";
import { GatewayService } from "../../../../shared/helpers/GatewayService.js";
import { StripeHelper } from "../../../../shared/helpers/StripeHelper.js";

// One one-time card gift: Stripe sends charge.succeeded and payment_intent.succeeded for it.
const charge = { id: "ch_1", object: "charge", payment_intent: "pi_1", amount: 12301, currency: "usd", customer: "cus_1", created: 1762600000, metadata: {} };
const paymentIntent = { id: "pi_1", object: "payment_intent", latest_charge: "ch_1", amount: 12301, amount_received: 12301, currency: "usd", customer: "cus_1", created: 1762600000, metadata: {} };
const events: Record<string, any> = {
  charge: { eventId: "evt_charge", eventType: "charge.succeeded", eventData: charge },
  paymentIntent: { eventId: "evt_pi", eventType: "payment_intent.succeeded", eventData: paymentIntent }
};

function makeController() {
  const rows: any[] = [];
  const controller = new DonateController();
  (controller as any).repos = {
    gateway: { loadAll: jest.fn(async () => [{ id: "GAT1", provider: "Stripe" }]) },
    eventLog: { loadByProviderId: jest.fn(async () => null) },
    customer: { load: jest.fn(async () => ({ personId: "PER1" })) },
    donationBatch: { getOrCreateCurrent: jest.fn(async () => ({ id: "BAT1" })) },
    fund: { getOrCreateGeneral: jest.fn(async () => ({ id: "FUN1" })) },
    donation: {
      loadByTransactionId: jest.fn(async (_c: string, id: string) => rows.find((r) => r.transactionId === id) || null),
      save: jest.fn(async (d: any) => { rows.push(d); }),
      updateStatus: jest.fn(async (_c: string, id: string, status: string) => { rows.filter((r) => r.transactionId === id).forEach((r) => { r.status = status; }); })
    }
  };
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, rows };
}

async function deliver(controller: DonateController, key: string) {
  (GatewayService.verifyWebhook as jest.Mock).mockResolvedValueOnce({ success: true, shouldProcess: true, ...events[key] });
  const req: any = { params: { provider: "stripe" }, query: { churchId: "CHU1" }, headers: {}, body: { id: events[key].eventId }, protocol: "https", hostname: "api", get: () => undefined };
  return (controller as any).webhook(req, {});
}

describe("DonateController Stripe webhook: one-time card gift", () => {
  beforeEach(() => {
    jest.spyOn(StripeHelper, "getPaymentDetails").mockResolvedValue({ method: "Card", methodDetails: "visa ****4242" } as any);
  });

  it("records one donation when charge.succeeded arrives before payment_intent.succeeded", async () => {
    const { controller, rows } = makeController();
    await deliver(controller, "charge");
    await deliver(controller, "paymentIntent");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("complete");
  });

  it("records one donation when payment_intent.succeeded arrives before charge.succeeded", async () => {
    const { controller, rows } = makeController();
    await deliver(controller, "paymentIntent");
    await deliver(controller, "charge");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("complete");
  });

  it("stores the gift under its PaymentIntent id whichever event arrives first", async () => {
    const first = makeController();
    await deliver(first.controller, "charge");
    const second = makeController();
    await deliver(second.controller, "paymentIntent");
    expect(first.rows[0].transactionId).toBe("pi_1");
    expect(second.rows[0].transactionId).toBe("pi_1");
  });
});
