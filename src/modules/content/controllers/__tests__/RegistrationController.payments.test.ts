import "reflect-metadata";
import express from "express";

// @churchapps/apihelper ships ESM that jest does not transform; the controller only uses its CurrencyHelper (balance reminders).
jest.mock("@churchapps/apihelper", () => ({ CurrencyHelper: { formatCurrencyWithLocale: (n: number) => n.toFixed(2) } }));
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { registrations: { view: "regView", edit: "regEdit" } },
  RegistrationHelper: {},
  RegistrationPricingHelper: jest.requireActual("../../helpers/RegistrationPricingHelper").RegistrationPricingHelper,
  RegistrationPaymentHelper: jest.requireActual("../../helpers/RegistrationPaymentHelper").RegistrationPaymentHelper
}));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({}) }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ gateway: { loadAll: jest.fn(async () => [{ id: "g1", provider: "stripe", currency: "USD" }]) } })) } }));
jest.mock("../../../../shared/helpers/GatewayService", () => ({ GatewayService: { supportsRefund: jest.fn(() => true), refundDonation: jest.fn() } }));
jest.mock("../../helpers/AnonymousRateLimiter", () => ({ AnonymousRateLimiter: {} }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: {} }));

import { RegistrationController } from "../RegistrationController.js";
import { GatewayService } from "../../../../shared/helpers/GatewayService.js";
import { Registration, RegistrationPayment } from "../../models/index.js";

type JsonError = { obj: { error?: string }; status: number };
type Result = { registration: Registration; payments: RegistrationPayment[] } & Partial<JsonError>;

const refundDonation = GatewayService.refundDonation as jest.Mock;
const supportsRefund = GatewayService.supportsRefund as jest.Mock;

// In-memory stand-ins for the registrations and registrationPayments tables, scoped by churchId like the real repos.
function makeController(opts: { registration?: Registration; payments?: RegistrationPayment[]; canEdit?: boolean; churchId?: string } = {}) {
  const registrations: Registration[] = [{ id: "r1", churchId: "c1", personId: "p1", status: "pending", totalAmount: "45.00" as unknown as number, amountPaid: "0.00" as unknown as number, ...opts.registration }];
  const payments: RegistrationPayment[] = (opts.payments || []).map((p) => ({ churchId: "c1", registrationId: "r1", status: "succeeded", ...p }));
  let nextId = 1;
  const repos = {
    registration: {
      load: jest.fn(async (churchId: string, id: string) => { const r = registrations.find((x) => x.id === id && x.churchId === churchId); return r ? { ...r } : undefined; }),
      updatePaidIfUnchanged: jest.fn(async (churchId: string, id: string, expected: Registration, next: Registration) => {
        const r = registrations.find((x) => x.id === id && x.churchId === churchId);
        if (!r || Number(r.amountPaid) !== Number(expected.amountPaid) || r.status !== expected.status) return false;
        r.amountPaid = next.amountPaid;
        r.status = next.status;
        return true;
      })
    },
    registrationPayment: {
      load: jest.fn(async (churchId: string, id: string) => payments.find((p) => p.id === id && p.churchId === churchId)),
      loadForRegistration: jest.fn(async (churchId: string, registrationId: string) => payments.filter((p) => p.churchId === churchId && p.registrationId === registrationId)),
      save: jest.fn(async (p: RegistrationPayment) => {
        if (p.id) { Object.assign(payments.find((x) => x.id === p.id), p); return p; }
        p.id = "new" + nextId++;
        p.createdDate = new Date();
        payments.push(p);
        return p;
      }),
      delete: jest.fn(async (churchId: string, id: string) => { const i = payments.findIndex((p) => p.id === id && p.churchId === churchId); if (i >= 0) payments.splice(i, 1); }),
      reservePendingRefund: jest.fn(async (p: RegistrationPayment, chargeAmount: number) => {
        if (payments.some((x) => x.kind === "refund" && x.status === "pending")) return false;
        const refunded = payments.filter((x) => x.kind === "refund" && x.provider && x.transactionId === p.transactionId).reduce((s, x) => s + Number(x.amount), 0);
        if (refunded + Number(p.amount) > chargeAmount) return false;
        Object.assign(p, { id: "ref" + nextId++, kind: "refund", status: "pending", createdDate: new Date() });
        payments.push(p);
        return true;
      })
    }
  };
  const au = { churchId: opts.churchId ?? "c1", personId: "admin1", checkAccess: jest.fn(() => opts.canEdit ?? true) };
  const controller = new RegistrationController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos, registrations, payments, au };
}

const req = (body: unknown) => ({ body } as express.Request);
const res = {} as express.Response;

beforeEach(() => {
  refundDonation.mockReset();
  supportsRefund.mockReset().mockReturnValue(true);
});

describe("record offline payment", () => {
  it("writes a kind=payment row with the check number and raises amountPaid", async () => {
    const { controller, payments, registrations } = makeController();
    const result = (await controller.recordOfflinePayment("r1", req({ amount: "20", method: "check", checkNumber: " 1042 " }), res)) as Result;
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ kind: "payment", method: "check", transactionId: "1042", amount: 20, status: "succeeded", churchId: "c1", registrationId: "r1" });
    expect(Number(registrations[0].amountPaid)).toBe(20);
    expect(registrations[0].status).toBe("pending");
    expect(result.registration.amountPaid).toBe(20);
    expect(result.payments).toHaveLength(1);
  });

  it("confirms a pending registration once it is paid in full, like the online pay path", async () => {
    const { controller, registrations } = makeController({ registration: { amountPaid: 20 } });
    await controller.recordOfflinePayment("r1", req({ amount: 25, method: "cash" }), res);
    expect(Number(registrations[0].amountPaid)).toBe(45);
    expect(registrations[0].status).toBe("confirmed");
  });

  it("stores no reference for cash even when a check number is sent", async () => {
    const { controller, payments } = makeController();
    await controller.recordOfflinePayment("r1", req({ amount: 5, method: "cash", checkNumber: "99" }), res);
    expect(payments[0].transactionId).toBeNull();
  });

  it.each([[0], [-5], ["abc"], [10.555], [undefined]])("rejects amount %p", async (amount) => {
    const { controller, payments, registrations } = makeController();
    const result = (await controller.recordOfflinePayment("r1", req({ amount, method: "cash" }), res)) as JsonError;
    expect(result.status).toBe(400);
    expect(payments).toHaveLength(0);
    expect(Number(registrations[0].amountPaid)).toBe(0);
  });

  it("rejects more than the balance due (no overpayment)", async () => {
    const { controller, payments } = makeController({ registration: { amountPaid: 40 } });
    const result = (await controller.recordOfflinePayment("r1", req({ amount: 5.01, method: "cash" }), res)) as JsonError;
    expect(result.status).toBe(400);
    expect(payments).toHaveLength(0);
  });

  it("rejects card, scholarship and other unknown methods", async () => {
    const { controller } = makeController();
    for (const method of ["card", "scholarship", ""]) {
      const result = (await controller.recordOfflinePayment("r1", req({ amount: 5, method }), res)) as JsonError;
      expect(result.status).toBe(400);
    }
  });

  it("requires Registrations Edit", async () => {
    const { controller, payments, au } = makeController({ canEdit: false });
    const result = (await controller.recordOfflinePayment("r1", req({ amount: 5, method: "cash" }), res)) as JsonError;
    expect(result.status).toBe(401);
    expect(au.checkAccess).toHaveBeenCalledWith("regEdit");
    expect(payments).toHaveLength(0);
  });

  it("can't reach another church's registration", async () => {
    const { controller, payments } = makeController({ churchId: "c2" });
    const result = (await controller.recordOfflinePayment("r1", req({ amount: 5, method: "cash" }), res)) as JsonError;
    expect(result.status).toBe(404);
    expect(payments).toHaveLength(0);
  });

  it("refuses cancelled and waitlisted registrations", async () => {
    for (const status of ["cancelled", "waitlisted"]) {
      const { controller } = makeController({ registration: { status } });
      const result = (await controller.recordOfflinePayment("r1", req({ amount: 5, method: "cash" }), res)) as JsonError;
      expect(result.status).toBe(409);
    }
  });

  it("treats an identical payment submitted again right away as a double submit", async () => {
    const { controller, payments, registrations } = makeController();
    await controller.recordOfflinePayment("r1", req({ amount: 10, method: "check", checkNumber: "7" }), res);
    const second = (await controller.recordOfflinePayment("r1", req({ amount: 10, method: "check", checkNumber: "7" }), res)) as JsonError;
    expect(second.status).toBe(409);
    expect(payments).toHaveLength(1);
    expect(Number(registrations[0].amountPaid)).toBe(10);
  });

  it("removes the row again when amountPaid changed underneath it", async () => {
    const { controller, payments, repos } = makeController();
    repos.registration.updatePaidIfUnchanged.mockResolvedValueOnce(false);
    const result = (await controller.recordOfflinePayment("r1", req({ amount: 10, method: "cash" }), res)) as JsonError;
    expect(result.status).toBe(409);
    expect(payments).toHaveLength(0);
  });
});

describe("refund a gateway payment", () => {
  const charge: RegistrationPayment = { id: "pay1", kind: "charge", method: "card", provider: "stripe", transactionId: "pi_1", amount: 45, currency: "usd", createdDate: new Date(Date.now() - 86400000) };
  const paidReg = { status: "confirmed", amountPaid: 45 } as Registration;

  it("refunds through the gateway, records a kind=refund row and lowers amountPaid", async () => {
    refundDonation.mockResolvedValue({ success: true, refundId: "re_1" });
    const { controller, payments, registrations } = makeController({ registration: paidReg, payments: [charge] });
    const result = (await controller.refundGatewayPayment("pay1", req({ amount: 15 }), res)) as Result;
    expect(refundDonation).toHaveBeenCalledTimes(1);
    const [gateway, transactionId, options] = refundDonation.mock.calls[0];
    expect(gateway.provider).toBe("stripe");
    expect(transactionId).toBe("pi_1");
    expect(options).toMatchObject({ amount: 15, currency: "usd" });
    expect(options.idempotencyKey).toMatch(/^registration-refund-/);
    const refund = payments.find((p) => p.kind === "refund");
    expect(refund).toMatchObject({ amount: 15, status: "succeeded", transactionId: "pi_1", provider: "stripe", method: "card" });
    expect(Number(registrations[0].amountPaid)).toBe(30);
    expect(registrations[0].status).toBe("confirmed");
    expect(result.registration.amountPaid).toBe(30);
  });

  it("records nothing when the gateway refund fails", async () => {
    refundDonation.mockResolvedValue({ success: false, error: "Charge has already been refunded." });
    const { controller, payments, registrations } = makeController({ registration: paidReg, payments: [charge] });
    const result = (await controller.refundGatewayPayment("pay1", req({ amount: 45 }), res)) as JsonError;
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("Charge has already been refunded.");
    expect(payments).toHaveLength(1);
    expect(Number(registrations[0].amountPaid)).toBe(45);
  });

  it("records nothing when the gateway call throws", async () => {
    refundDonation.mockRejectedValue(new Error("network down"));
    const { controller, payments, registrations } = makeController({ registration: paidReg, payments: [charge] });
    const result = (await controller.refundGatewayPayment("pay1", req({ amount: 45 }), res)) as JsonError;
    expect(result.status).toBe(400);
    expect(payments).toHaveLength(1);
    expect(Number(registrations[0].amountPaid)).toBe(45);
  });

  it("rejects more than the payment minus earlier refunds on it, before calling the gateway", async () => {
    const earlier: RegistrationPayment = { id: "ref0", kind: "refund", provider: "stripe", transactionId: "pi_1", amount: 40, method: "card", createdDate: new Date(Date.now() - 3600000) };
    const { controller, payments } = makeController({ registration: { status: "confirmed", amountPaid: 5 }, payments: [charge, earlier] });
    const result = (await controller.refundGatewayPayment("pay1", req({ amount: 5.01 }), res)) as JsonError;
    expect(result.status).toBe(400);
    expect(refundDonation).not.toHaveBeenCalled();
    expect(payments).toHaveLength(2);
  });

  it("rejects a missing or non-positive amount", async () => {
    const { controller } = makeController({ registration: paidReg, payments: [charge] });
    for (const amount of [undefined, 0, -1]) {
      const result = (await controller.refundGatewayPayment("pay1", req({ amount }), res)) as JsonError;
      expect(result.status).toBe(400);
    }
    expect(refundDonation).not.toHaveBeenCalled();
  });

  it("lets only one of two simultaneous submits reach the gateway", async () => {
    let release: (v: { success: boolean }) => void;
    refundDonation.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { controller, payments, registrations } = makeController({ registration: paidReg, payments: [charge] });
    const first = controller.refundGatewayPayment("pay1", req({ amount: 10 }), res) as Promise<Result>;
    await new Promise((r) => setImmediate(r));
    const second = (await controller.refundGatewayPayment("pay1", req({ amount: 10 }), res)) as JsonError;
    expect(second.status).toBe(409);
    release({ success: true });
    await first;
    expect(refundDonation).toHaveBeenCalledTimes(1);
    expect(payments.filter((p) => p.kind === "refund")).toHaveLength(1);
    expect(Number(registrations[0].amountPaid)).toBe(35);
  });

  it("refuses offline payments and refund rows", async () => {
    const cash: RegistrationPayment = { id: "pay2", kind: "payment", method: "cash", amount: 10 };
    const refundRow: RegistrationPayment = { id: "ref9", kind: "refund", provider: "stripe", transactionId: "pi_1", amount: 5 };
    const { controller } = makeController({ registration: paidReg, payments: [charge, cash, refundRow] });
    for (const id of ["pay2", "ref9"]) {
      const result = (await controller.refundGatewayPayment(id, req({ amount: 1 }), res)) as JsonError;
      expect(result.status).toBe(400);
    }
    expect(refundDonation).not.toHaveBeenCalled();
  });

  it("refuses when the payment's gateway has no refunds", async () => {
    supportsRefund.mockReturnValue(false);
    const { controller, payments } = makeController({ registration: paidReg, payments: [charge] });
    const result = (await controller.refundGatewayPayment("pay1", req({ amount: 5 }), res)) as JsonError;
    expect(result.status).toBe(400);
    expect(refundDonation).not.toHaveBeenCalled();
    expect(payments).toHaveLength(1);
  });

  it("requires Registrations Edit and stays inside the church", async () => {
    const denied = makeController({ registration: paidReg, payments: [charge], canEdit: false });
    expect(((await denied.controller.refundGatewayPayment("pay1", req({ amount: 5 }), res)) as JsonError).status).toBe(401);
    const otherChurch = makeController({ registration: paidReg, payments: [charge], churchId: "c2" });
    expect(((await otherChurch.controller.refundGatewayPayment("pay1", req({ amount: 5 }), res)) as JsonError).status).toBe(404);
    expect(refundDonation).not.toHaveBeenCalled();
  });
});

describe("record offline refund", () => {
  it("writes a kind=refund row with no gateway call and lowers amountPaid without changing status", async () => {
    const { controller, payments, registrations } = makeController({ registration: { status: "confirmed", amountPaid: 45 }, payments: [{ id: "pay2", kind: "payment", method: "cash", amount: 45 }] });
    const result = (await controller.recordOfflineRefund("r1", req({ amount: 20, method: "check", checkNumber: "5001" }), res)) as Result;
    expect(refundDonation).not.toHaveBeenCalled();
    expect(payments.find((p) => p.kind === "refund")).toMatchObject({ amount: 20, method: "check", transactionId: "5001", status: "succeeded" });
    expect(Number(registrations[0].amountPaid)).toBe(25);
    expect(registrations[0].status).toBe("confirmed");
    expect(result.payments).toHaveLength(2);
  });

  it("works on a cancelled registration", async () => {
    const { controller, registrations } = makeController({ registration: { status: "cancelled", amountPaid: 45 } });
    await controller.recordOfflineRefund("r1", req({ amount: 45, method: "cash" }), res);
    expect(Number(registrations[0].amountPaid)).toBe(0);
    expect(registrations[0].status).toBe("cancelled");
  });

  it("rejects more than has been paid", async () => {
    const { controller, payments } = makeController({ registration: { amountPaid: 10 } });
    const result = (await controller.recordOfflineRefund("r1", req({ amount: 10.01, method: "cash" }), res)) as JsonError;
    expect(result.status).toBe(400);
    expect(payments).toHaveLength(0);
  });

  it("requires Registrations Edit", async () => {
    const { controller, payments } = makeController({ registration: { amountPaid: 10 }, canEdit: false });
    const result = (await controller.recordOfflineRefund("r1", req({ amount: 5, method: "cash" }), res)) as JsonError;
    expect(result.status).toBe(401);
    expect(payments).toHaveLength(0);
  });
});
