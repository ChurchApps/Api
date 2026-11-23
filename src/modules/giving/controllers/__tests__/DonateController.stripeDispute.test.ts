import "reflect-metadata";
import express from "express";

jest.mock("../GivingBaseController", () => ({ GivingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { edit: "donationsEdit" } } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { membershipApi: "http://membership" } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("../../helpers/DunningHelper.js", () => ({ DunningHelper: { notify: jest.fn() } }));
jest.mock("../../models/index.js", () => ({}));
jest.mock("@churchapps/apihelper", () => ({ CurrencyHelper: {} }));
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../../../../shared/helpers/GatewayService.js", () => {
  const { StripeHelper } = jest.requireActual("../../../../shared/helpers/StripeHelper");
  const { StripeGatewayProvider } = jest.requireActual("../../../../shared/helpers/gateways/StripeGatewayProvider");
  return {
    GatewayService: {
      getProviderFromGateway: jest.fn(() => ({ capabilities: { supportsWebhooks: true } })),
      verifyWebhook: jest.fn(),
      classifyWebhookEvent: (_gateway: unknown, eventType: string) => new StripeGatewayProvider().classifyWebhookEvent(eventType),
      logEvent: jest.fn(),
      logDonation: jest.fn(),
      updateDonationStatus: (_gateway: unknown, churchId: string, transactionId: string, status: "pending" | "complete" | "failed" | "refunded", repos: unknown) => StripeHelper.updateDonationStatus(churchId, transactionId, status, repos)
    }
  };
});

import { DonateController } from "../DonateController.js";
import { GatewayService } from "../../../../shared/helpers/GatewayService.js";
import { StripeHelper } from "../../../../shared/helpers/StripeHelper.js";
import { StripeGatewayProvider } from "../../../../shared/helpers/gateways/StripeGatewayProvider.js";
import { GatewayConfig } from "../../../../shared/helpers/gateways/IGatewayProvider.js";
import { Donation } from "../../models/index.js";

const dispute = (status: string, extra: Record<string, unknown> = {}) => ({ id: "dp_1", object: "dispute", charge: "ch_1", payment_intent: "pi_1", amount: 5000, currency: "usd", created: 1762600000, status, ...extra });

function makeController(seed: Donation[]) {
  const rows: Donation[] = seed.map((d) => ({ ...d }));
  const seenEvents = new Set<string>();
  const controller = new DonateController();
  const repos = {
    gateway: { loadAll: jest.fn(async () => [{ id: "GAT1", provider: "Stripe" }]) },
    eventLog: { loadByProviderId: jest.fn(async (_c: string, id: string) => (seenEvents.has(id) ? { id } : null)) },
    donation: {
      loadByTransactionId: jest.fn(async (churchId: string, id: string) => rows.find((r) => r.churchId === churchId && r.transactionId === id) || null),
      save: jest.fn(),
      updateStatus: jest.fn(async (churchId: string, id: string, status: Donation["status"]) => { rows.filter((r) => r.churchId === churchId && r.transactionId === id).forEach((r) => { r.status = status; }); })
    }
  };
  (GatewayService.logEvent as jest.Mock).mockImplementation(async (_g: unknown, _c: string, body: { id: string }) => { seenEvents.add(body.id); });
  Object.assign(controller, {
    repos,
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action(),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, rows, repos };
}

async function deliver(controller: DonateController, eventId: string, eventData: Record<string, unknown>, churchId = "CHU1") {
  (GatewayService.verifyWebhook as jest.Mock).mockImplementationOnce(async () => {
    const helper: { verifySignature: (...args: never[]) => Promise<unknown> } = StripeHelper;
    jest.spyOn(helper, "verifySignature").mockResolvedValueOnce({ id: eventId, type: "charge.dispute.closed", data: { object: eventData } });
    return new StripeGatewayProvider().verifyWebhookSignature({ privateKey: "sk_test", webhookKey: "whsec_test" } as GatewayConfig, { "stripe-signature": "sig" }, {});
  });
  const req: Partial<express.Request<{ provider: string }>> = { params: { provider: "stripe" }, query: { churchId }, headers: {}, body: { id: eventId }, protocol: "https", hostname: "api", get: (): undefined => undefined };
  return controller.webhook(req as express.Request<{ provider: string }>, {} as express.Response);
}

describe("DonateController Stripe webhook: charge.dispute.closed", () => {
  const gift = (overrides: Partial<Donation> = {}): Donation => ({ id: "DON1", churchId: "CHU1", transactionId: "pi_1", status: "complete", ...overrides });

  it("marks the gift refunded when the dispute is lost", async () => {
    const { controller, rows } = makeController([gift()]);
    await deliver(controller, "evt_1", dispute("lost"));
    expect(rows[0].status).toBe("refunded");
  });

  it("matches a gift stored under its charge id", async () => {
    const { controller, rows } = makeController([gift({ transactionId: "ch_1" })]);
    await deliver(controller, "evt_1", dispute("lost", { payment_intent: null }));
    expect(rows[0].status).toBe("refunded");
  });

  it("leaves the gift alone when the dispute is won or closed otherwise", async () => {
    const { controller, rows, repos } = makeController([gift()]);
    await deliver(controller, "evt_won", dispute("won"));
    await deliver(controller, "evt_warn", dispute("warning_closed"));
    expect(rows[0].status).toBe("complete");
    expect(repos.donation.updateStatus).not.toHaveBeenCalled();
  });

  it("handles the same event delivered twice", async () => {
    const { controller, rows, repos } = makeController([gift()]);
    const first = await deliver(controller, "evt_1", dispute("lost"));
    const second = await deliver(controller, "evt_1", dispute("lost"));
    expect(first).toEqual({ obj: {}, status: 200 });
    expect(second).toEqual({ obj: {}, status: 200 });
    expect(repos.donation.updateStatus).toHaveBeenCalledTimes(1);
    expect(rows[0].status).toBe("refunded");
  });

  it("does nothing for a charge it never recorded", async () => {
    const { controller, rows, repos } = makeController([gift({ transactionId: "pi_other" })]);
    const result = await deliver(controller, "evt_1", dispute("lost"));
    expect(result).toEqual({ obj: {}, status: 200 });
    expect(repos.donation.save).not.toHaveBeenCalled();
    expect(GatewayService.logDonation).not.toHaveBeenCalled();
    expect(rows[0].status).toBe("complete");
  });

  it("never touches another church's gift with the same charge", async () => {
    const { controller, rows } = makeController([gift({ churchId: "CHU2" })]);
    await deliver(controller, "evt_1", dispute("lost"), "CHU1");
    expect(rows[0].status).toBe("complete");
  });
});
