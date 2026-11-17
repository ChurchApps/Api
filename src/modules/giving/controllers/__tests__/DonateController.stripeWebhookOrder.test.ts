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
import { StripeGatewayProvider } from "../../../../shared/helpers/gateways/StripeGatewayProvider.js";

// One one-time card gift: Stripe sends charge.succeeded and payment_intent.succeeded for it.
const charge = { id: "ch_1", object: "charge", payment_intent: "pi_1", amount: 12301, currency: "usd", customer: "cus_1", created: 1762600000, metadata: {} };
const paymentIntent = { id: "pi_1", object: "payment_intent", latest_charge: "ch_1", amount: 12301, amount_received: 12301, currency: "usd", customer: "cus_1", created: 1762600000, metadata: {} };
const events: Record<string, any> = {
  charge: { eventId: "evt_charge", eventType: "charge.succeeded", eventData: charge },
  paymentIntent: { eventId: "evt_pi", eventType: "payment_intent.succeeded", eventData: paymentIntent },
  // A source-based charge from before PaymentIntents: charge.succeeded is its only event.
  legacy: { eventId: "evt_legacy", eventType: "charge.succeeded", eventData: { ...charge, id: "ch_2", payment_intent: null } }
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
  // Run the provider's real skip rules so the test sees which events it lets through.
  (GatewayService.verifyWebhook as jest.Mock).mockImplementationOnce(async () => {
    jest.spyOn(StripeHelper, "verifySignature").mockResolvedValueOnce({ id: events[key].eventId, type: events[key].eventType, data: { object: events[key].eventData } } as any);
    return new StripeGatewayProvider().verifyWebhookSignature({ privateKey: "sk_test", webhookKey: "whsec_test" } as any, { "stripe-signature": "sig" }, {});
  });
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

  it("records the gift from payment_intent.succeeded and leaves its charge.succeeded alone", async () => {
    const first = makeController();
    await deliver(first.controller, "charge");
    const second = makeController();
    await deliver(second.controller, "paymentIntent");
    expect(first.rows).toHaveLength(0);
    expect(second.rows[0].transactionId).toBe("pi_1");
  });

  it("still records a legacy charge that has no PaymentIntent", async () => {
    const { controller, rows } = makeController();
    await deliver(controller, "legacy");
    expect(rows).toHaveLength(1);
    expect(rows[0].transactionId).toBe("ch_2");
  });

  it("records one donation when both events are delivered at the same time", async () => {
    const { controller, rows } = makeController();
    await Promise.all([deliver(controller, "charge"), deliver(controller, "paymentIntent")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].transactionId).toBe("pi_1");
  });
});
