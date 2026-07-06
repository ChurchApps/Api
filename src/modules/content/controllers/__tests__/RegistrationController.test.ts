import "reflect-metadata";

jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { registrations: { view: "regView", edit: "regEdit" } },
  RegistrationHelper: { sendConfirmationEmail: jest.fn(), sendCancellationEmail: jest.fn(), sendWaitlistAvailabilityEmail: jest.fn() },
  RegistrationPricingHelper: jest.requireActual("../../helpers/RegistrationPricingHelper").RegistrationPricingHelper
}));
jest.mock("../../../../shared/modules/index", () => ({
  getMembershipModuleGateway: () => ({
    loadPerson: jest.fn(async () => ({ householdId: "h1", email: "person@example.com" })),
    loadChurch: jest.fn(async () => ({ name: "Grace" })),
    getOrCreateGuestPerson: jest.fn(async () => ({ personId: "guest1", householdId: "gh1", email: "guest@example.com" }))
  })
}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ gateway: {} })) } }));
jest.mock("../../../../shared/helpers/GatewayService", () => ({ GatewayService: { getGatewayForChurch: jest.fn(async () => ({ provider: "stripe", currency: "USD" })), prepareCharge: jest.fn(), processCharge: jest.fn() } }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: { b1AdminRoot: "https://app.test", supportEmail: "s@test" } }));

import { RegistrationController } from "../RegistrationController.js";
import { GatewayService } from "../../../../shared/helpers/GatewayService.js";

const processCharge = GatewayService.processCharge as jest.Mock;

function makeController(opts: any = {}) {
  const repos: any = {
    event: { load: jest.fn(async () => opts.event ?? { id: "e1", registrationEnabled: true, capacity: 50 }) },
    registration: {
      loadForEvent: jest.fn(async () => opts.existingRegs ?? []),
      atomicInsertWithCapacityCheck: jest.fn(async (reg: any) => { reg.id = "REGID"; return opts.capacityOk ?? true; }),
      save: jest.fn(async (r: any) => { if (!r.id) r.id = "REGID"; return r; }),
      delete: jest.fn(),
      load: jest.fn(async () => opts.existing),
      countActiveForCoupon: jest.fn(async () => opts.couponUses ?? 0),
      promoteFromWaitlist: jest.fn(async () => opts.promoted ?? null)
    },
    registrationType: { loadForEvent: jest.fn(async () => opts.types ?? []) },
    registrationSelection: { loadForEvent: jest.fn(async () => opts.selections ?? []) },
    registrationCoupon: { loadByCode: jest.fn(async () => opts.coupon), load: jest.fn(async () => opts.coupon) },
    registrationMember: { atomicInsertWithTypeCapacity: jest.fn(async () => opts.typeOk ?? true), deleteForRegistration: jest.fn(), loadForRegistration: jest.fn(async () => opts.savedMembers ?? []) },
    registrationSelectionChoice: { atomicInsertWithCapacityCheck: jest.fn(async () => opts.selOk ?? true), deleteForRegistration: jest.fn(), loadForRegistration: jest.fn(async () => []) },
    registrationPayment: { save: jest.fn(async (r: any) => r), deleteForRegistration: jest.fn(), loadForRegistration: jest.fn(async () => []) }
  };
  const au = { churchId: "c1", personId: opts.auPersonId ?? "admin1", checkAccess: () => opts.checkAccess ?? true };
  const controller = new RegistrationController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

beforeEach(() => { processCharge.mockReset(); });

describe("register — free event", () => {
  it("confirms without charging when total is 0", async () => {
    const { controller, repos } = makeController();
    const result = await (controller as any).register({ body: { churchId: "c1", eventId: "e1", members: [{ firstName: "A", lastName: "B" }] } }, {});
    expect(processCharge).not.toHaveBeenCalled();
    expect(result.status).toBe("confirmed");
    expect(repos.registration.atomicInsertWithCapacityCheck).toHaveBeenCalled();
  });
});

describe("register — paid event", () => {
  const types = [{ id: "t1", price: "45.00", capacity: 6, active: true }];

  it("charges the server-computed total (ignoring a tampered client amount) and records the payment", async () => {
    processCharge.mockResolvedValue({ success: true, transactionId: "tx1", data: { id: "tx1", status: "succeeded", currency: "usd" } });
    const { controller, repos } = makeController({ types });
    const result = await (controller as any).register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", amount: 999, members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } }, {});
    expect(processCharge).toHaveBeenCalledTimes(1);
    expect(processCharge.mock.calls[0][1].amount).toBe(45);
    expect(repos.registrationPayment.save).toHaveBeenCalled();
    expect(result.status).toBe("confirmed");
    expect(result.amountPaid).toBe(45);
  });

  it("rolls back inserted rows and returns the gateway error when the charge declines", async () => {
    processCharge.mockResolvedValue({ success: false, error: "Card declined" });
    const { controller, repos } = makeController({ types });
    const result = await (controller as any).register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } }, {});
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("Card declined");
    expect(repos.registration.delete).toHaveBeenCalled();
    expect(repos.registrationMember.deleteForRegistration).toHaveBeenCalled();
  });

  it("applies a percent coupon before charging", async () => {
    processCharge.mockResolvedValue({ success: true, transactionId: "tx2", data: { id: "tx2", status: "succeeded" } });
    const coupon = { id: "cp1", discountType: "percent", value: 10, active: true };
    const { controller } = makeController({ types, coupon });
    await (controller as any).register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", couponCode: "EARLYBIRD", members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } }, {});
    expect(processCharge.mock.calls[0][1].amount).toBe(40.5);
  });

  it("rejects an attendee type that does not belong to the event", async () => {
    const { controller } = makeController({ types });
    const result = await (controller as any).register({ body: { churchId: "c1", eventId: "e1", members: [{ firstName: "A", lastName: "B", registrationTypeId: "ghost" }] } }, {});
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("Invalid attendee type");
  });

  it("rejects an invalid coupon with its reason", async () => {
    const coupon = { id: "cp1", discountType: "percent", value: 10, active: false };
    const { controller } = makeController({ types, coupon });
    const result = await (controller as any).register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", couponCode: "X", members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } }, {});
    expect(result.status).toBe(400);
    expect(result.obj.reason).toBe("inactive");
  });
});

describe("register — capacity and waitlist", () => {
  it("lands on the waitlist (no charge) when full and waitlist is enabled", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", registrationEnabled: true, capacity: 1, waitlistEnabled: true }, capacityOk: false, types: [{ id: "t1", price: "45.00", active: true }] });
    const result = await (controller as any).register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } }, {});
    expect(result.status).toBe("waitlisted");
    expect(processCharge).not.toHaveBeenCalled();
    expect(repos.registration.save).toHaveBeenCalled();
  });

  it("returns 409 full when capacity is reached and waitlist is disabled", async () => {
    const { controller } = makeController({ event: { id: "e1", registrationEnabled: true, capacity: 1, waitlistEnabled: false }, capacityOk: false });
    const result = await (controller as any).register({ body: { churchId: "c1", eventId: "e1", members: [{ firstName: "A", lastName: "B" }] } }, {});
    expect(result.status).toBe(409);
    expect(result.obj.status).toBe("full");
  });

  it("rolls back and returns 409 type-full when a per-type guard rejects", async () => {
    const { controller, repos } = makeController({ types: [{ id: "t1", price: "0", capacity: 2, active: true }], typeOk: false });
    const result = await (controller as any).register({ body: { churchId: "c1", eventId: "e1", members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } }, {});
    expect(result.status).toBe(409);
    expect(result.obj.status).toBe("type-full");
    expect(repos.registration.delete).toHaveBeenCalled();
  });
});

describe("pay", () => {
  it("charges the outstanding balance and increments amountPaid", async () => {
    processCharge.mockResolvedValue({ success: true, transactionId: "tx3", data: { id: "tx3", status: "succeeded" } });
    const { controller, repos } = makeController({ existing: { id: "r1", churchId: "c1", personId: "p1", totalAmount: 100, amountPaid: 0, status: "pending" }, auPersonId: "p1" });
    const result = await (controller as any).pay("r1", { body: { provider: "stripe", token: "tok" } }, {});
    expect(processCharge.mock.calls[0][1].amount).toBe(100);
    expect(repos.registrationPayment.save).toHaveBeenCalled();
    expect(result.amountPaid).toBe(100);
  });

  it("rejects when there is no balance due", async () => {
    const { controller } = makeController({ existing: { id: "r1", churchId: "c1", personId: "p1", totalAmount: 50, amountPaid: 50 }, auPersonId: "p1" });
    const result = await (controller as any).pay("r1", { body: { provider: "stripe", token: "tok" } }, {});
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("No balance due");
  });
});

describe("promote", () => {
  it("returns 409 when nothing can be promoted", async () => {
    const { controller } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1" }, promoted: null });
    const result = await (controller as any).promote("r1", { body: null }, {});
    expect(result.status).toBe(409);
  });

  it("returns the promoted registration when a spot frees", async () => {
    const { controller } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1" }, promoted: { id: "r2", status: "pending", personId: "p2" } });
    const result = await (controller as any).promote("r1", { body: null }, {});
    expect(result.status).toBe("pending");
  });
});

describe("edit", () => {
  it("recomputes totalAmount from new members without charging", async () => {
    const types = [{ id: "t1", price: "20.00", active: true }];
    const { controller, repos } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1", personId: "p1", amountPaid: 0 }, types, auPersonId: "p1", savedMembers: [{ registrationTypeId: "t1" }] });
    const result = await (controller as any).edit("r1", { body: { members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } }, {});
    expect(processCharge).not.toHaveBeenCalled();
    expect(result.totalAmount).toBe(20);
    expect(repos.registration.save).toHaveBeenCalled();
  });
});
