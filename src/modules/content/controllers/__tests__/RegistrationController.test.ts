import "reflect-metadata";
import express from "express";

const loadPersonMock = jest.fn(async (_churchId: string, _personId: string): Promise<{ householdId: string; email: string } | null> => ({ householdId: "h1", email: "person@example.com" }));
// @churchapps/apihelper ships ESM that jest does not transform; a plain formatter stands in.
jest.mock("@churchapps/apihelper", () => ({ CurrencyHelper: { formatCurrencyWithLocale: (n: number, currency: string) => (currency === "usd" ? "$" : currency.toUpperCase() + " ") + n.toFixed(2) } }));
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { registrations: { view: "regView", edit: "regEdit" } },
  RegistrationHelper: { sendConfirmationEmail: jest.fn(), sendCancellationEmail: jest.fn(), sendWaitlistAvailabilityEmail: jest.fn(), sendBalanceReminderEmail: jest.fn() },
  RegistrationPricingHelper: jest.requireActual("../../helpers/RegistrationPricingHelper").RegistrationPricingHelper,
  RegistrationPaymentHelper: jest.requireActual("../../helpers/RegistrationPaymentHelper").RegistrationPaymentHelper
}));
const mockLoadHouseholdPeople = jest.fn(async (_churchId: string, _personIds: string[]) => [{ id: "p1", householdId: "h1" }, { id: "p1kid", householdId: "h1" }]);
jest.mock("../../../../shared/modules/index", () => ({
  getMembershipModuleGateway: () => ({
    loadPerson: (churchId: string, personId: string) => loadPersonMock(churchId, personId),
    loadChurch: jest.fn(async () => ({ name: "Grace", subDomain: "grace" })),
    loadHouseholdPeople: (churchId: string, personIds: string[]) => mockLoadHouseholdPeople(churchId, personIds),
    getOrCreateGuestPerson: jest.fn(async () => ({ personId: "guest1", householdId: "gh1", email: "guest@example.com" }))
  })
}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ gateway: { loadAll: jest.fn(async () => [{ id: "g1", provider: "stripe" }]) } })) } }));
jest.mock("../../../../shared/helpers/GatewayService", () => ({ GatewayService: { getGatewayForChurch: jest.fn(async () => ({ provider: "stripe", currency: "USD" })), prepareCharge: jest.fn(), processCharge: jest.fn() } }));
const consume = jest.fn(async (..._args: unknown[]) => true);
jest.mock("../../helpers/AnonymousRateLimiter", () => ({ AnonymousRateLimiter: { consume: (...args: unknown[]) => consume(...args), ipBucket: jest.fn(() => ({ key: "ip", max: 1 })), keyBucket: jest.fn(() => ({ key: "k", max: 1 })) } }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: { b1AdminRoot: "https://app.test", b1AppRoot: "https://{subdomain}.b1.test", supportEmail: "s@test" } }));

import { RegistrationController } from "../RegistrationController.js";
import { WebhookDispatcher } from "../../../../shared/webhooks/index.js";
import { GatewayService } from "../../../../shared/helpers/GatewayService.js";
import { RepoManager } from "../../../../shared/infrastructure/RepoManager.js";
import { RegistrationHelper } from "../../helpers/index.js";
import { Environment } from "../../../../shared/helpers/Environment.js";
import { CaptchaPass } from "../../../../shared/helpers/CaptchaPass.js";
import { Event, Registration, RegistrationCoupon, RegistrationMember, RegistrationPayment, RegistrationSelection, RegistrationSelectionChoice, RegistrationType } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
// Actions return either the saved registration or the json(obj, status) stub's error shape.
type RegResult = Omit<Registration, "status"> & { status?: string | number; obj?: { error?: string; reason?: string; status?: string; code?: string } };
// MySQL DECIMAL columns come back as strings, so fixtures mirror that.
type DbRegistrationType = Omit<RegistrationType, "price"> & { price?: number | string };
type DbRegistrationCoupon = Omit<RegistrationCoupon, "value"> & { value?: number | string };

interface ControllerOpts {
  event?: Event;
  existingRegs?: Registration[];
  capacityOk?: boolean;
  existing?: Registration;
  couponUses?: number;
  promoted?: Registration | null;
  types?: DbRegistrationType[];
  selections?: RegistrationSelection[];
  coupon?: DbRegistrationCoupon;
  typeOk?: boolean;
  savedMembers?: RegistrationMember[];
  selOk?: boolean;
  auPersonId?: string;
  leaderGroupIds?: string[];
  checkAccess?: boolean;
  typeCount?: number;
  payments?: RegistrationPayment[];
  registeredPersonIds?: string[];
}

const processCharge = GatewayService.processCharge as jest.Mock;

function makeController(opts: ControllerOpts = {}) {
  const repos = {
    event: { load: jest.fn(async () => opts.event ?? { id: "e1", registrationEnabled: true, capacity: 50 }) },
    registration: {
      loadForEvent: jest.fn(async () => opts.existingRegs ?? []),
      atomicInsertWithCapacityCheck: jest.fn(async (reg: Registration) => { reg.id = "REGID"; return opts.capacityOk ?? true; }),
      save: jest.fn(async (r: Registration) => { if (!r.id) r.id = "REGID"; return r; }),
      delete: jest.fn(),
      load: jest.fn(async () => opts.existing),
      countActiveForCoupon: jest.fn(async () => opts.couponUses ?? 0),
      promoteFromWaitlist: jest.fn(async () => opts.promoted ?? null),
      restoreWithCapacityCheck: jest.fn(async (..._args: unknown[]) => opts.capacityOk ?? true),
      loadRegisteredPersonIds: jest.fn(async (_churchId: string, _eventId: string, personIds: string[], _excludeId?: string) => (opts.registeredPersonIds ?? []).filter((id) => personIds.includes(id)))
    },
    registrationType: { loadForEvent: jest.fn(async () => opts.types ?? []) },
    registrationSelection: { loadForEvent: jest.fn(async () => opts.selections ?? []) },
    registrationCoupon: { loadByCode: jest.fn(async () => opts.coupon), load: jest.fn(async () => opts.coupon) },
    registrationMember: {
      atomicInsertWithTypeCapacity: jest.fn(async (_m: RegistrationMember, _capacity: number | null) => opts.typeOk ?? true),
      deleteForRegistration: jest.fn(),
      loadForRegistration: jest.fn(async () => opts.savedMembers ?? []),
      countActiveForType: jest.fn(async () => opts.typeCount ?? 0)
    },
    registrationSelectionChoice: { atomicInsertWithCapacityCheck: jest.fn(async () => opts.selOk ?? true), deleteForRegistration: jest.fn(), loadForRegistration: jest.fn(async (): Promise<RegistrationSelectionChoice[]> => []) },
    registrationPayment: { save: jest.fn(async (r: RegistrationPayment) => r), deleteForRegistration: jest.fn(), loadForRegistration: jest.fn(async (): Promise<RegistrationPayment[]> => opts.payments ?? []) }
  };
  const au = { churchId: "c1", personId: opts.auPersonId ?? "admin1", leaderGroupIds: opts.leaderGroupIds ?? [], checkAccess: () => opts.checkAccess ?? true };
  const controller = new RegistrationController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action(),
    authUser: () => au,
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

beforeEach(() => { processCharge.mockReset(); });

describe("register — free event", () => {
  it("confirms without charging when total is 0", async () => {
    const { controller, repos } = makeController();
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", members: [{ firstName: "A", lastName: "B" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(processCharge).not.toHaveBeenCalled();
    expect(result.status).toBe("confirmed");
    expect(repos.registration.atomicInsertWithCapacityCheck).toHaveBeenCalled();
  });
});

describe("register — paid event", () => {
  const types = [{ id: "t1", price: "45.00", capacity: 6, active: true }];

  it("charges the server-computed total (ignoring a tampered client amount) and records the payment", async () => {
    processCharge.mockResolvedValue({ success: true, transactionId: "tx1", data: { id: "tx1", status: "succeeded", currency: "usd" } });
    const { controller, repos } = makeController({ types, auPersonId: "p1" });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", amount: 999, members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(processCharge).toHaveBeenCalledTimes(1);
    expect(processCharge.mock.calls[0][1].amount).toBe(45);
    expect(repos.registrationPayment.save).toHaveBeenCalled();
    expect(result.status).toBe("confirmed");
    expect(result.amountPaid).toBe(45);
  });

  it("rolls back inserted rows and returns the gateway error when the charge declines", async () => {
    processCharge.mockResolvedValue({ success: false, error: "Card declined" });
    const { controller, repos } = makeController({ types, auPersonId: "p1" });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("Card declined");
    expect(repos.registration.delete).toHaveBeenCalled();
    expect(repos.registrationMember.deleteForRegistration).toHaveBeenCalled();
  });

  it("applies a percent coupon before charging", async () => {
    processCharge.mockResolvedValue({ success: true, transactionId: "tx2", data: { id: "tx2", status: "succeeded" } });
    const coupon = { id: "cp1", discountType: "percent", value: 10, active: true };
    const { controller } = makeController({ types, coupon, auPersonId: "p1" });
    await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", couponCode: "EARLYBIRD", members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } } as express.Request, {} as express.Response);
    expect(processCharge.mock.calls[0][1].amount).toBe(40.5);
  });

  it("rejects an attendee type that does not belong to the event", async () => {
    const { controller } = makeController({ types });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", members: [{ firstName: "A", lastName: "B", registrationTypeId: "ghost" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("Invalid attendee type");
  });

  it("rejects an invalid coupon with its reason", async () => {
    const coupon = { id: "cp1", discountType: "percent", value: 10, active: false };
    const { controller } = makeController({ types, coupon });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", couponCode: "X", members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(400);
    expect(result.obj.reason).toBe("inactive");
  });
});

describe("register — guest captcha", () => {
  const types = [{ id: "t1", name: "Adult", price: 30, active: true }];
  const body = (extra: Record<string, unknown> = {}) => ({ churchId: "c1", eventId: "e1", provider: "stripe", token: "pm_1", guestInfo: { firstName: "G", lastName: "H", email: "g@x.com" }, members: [{ firstName: "G", lastName: "H", registrationTypeId: "t1" }], ...extra });

  beforeEach(() => { Object.assign(Environment, { captchaEnforce: true, jwtSecret: "test-secret" }); });
  afterEach(() => { Object.assign(Environment, { captchaEnforce: false, jwtSecret: undefined }); });

  it("refuses a paid guest registration without a pass, before charging, and rolls it back", async () => {
    const { controller, repos } = makeController({ types });
    const result = (await controller.register({ body: body() } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(403);
    expect(processCharge).not.toHaveBeenCalled();
    expect(repos.registration.delete).toHaveBeenCalled();
  });

  it("charges a paid guest registration that carries a valid pass", async () => {
    processCharge.mockResolvedValue({ success: true, data: { status: "succeeded" }, transactionId: "tx1" });
    const { controller } = makeController({ types });
    const result = (await controller.register({ body: body({ captchaPass: CaptchaPass.create("c1") }) } as express.Request, {} as express.Response)) as RegResult;
    expect(processCharge).toHaveBeenCalled();
    expect(result.status).toBe("confirmed");
  });

  it("refuses a pass issued for another church", async () => {
    const { controller } = makeController({ types });
    const result = (await controller.register({ body: body({ captchaPass: CaptchaPass.create("other") }) } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(403);
    expect(processCharge).not.toHaveBeenCalled();
  });

  it("lets a guest join the waitlist without a pass, since nothing is charged", async () => {
    const { controller } = makeController({ types, event: { id: "e1", registrationEnabled: true, capacity: 1, waitlistEnabled: true }, capacityOk: false });
    const result = (await controller.register({ body: body() } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe("waitlisted");
  });

  it("does not ask a signed-in member for a pass", async () => {
    processCharge.mockResolvedValue({ success: true, data: { status: "succeeded" }, transactionId: "tx1" });
    const { controller } = makeController({ types });
    Object.assign(controller, { authUser: () => ({ id: "u1", churchId: "c1", personId: "p1", checkAccess: () => false }) });
    const result = (await controller.register({ body: body({ guestInfo: undefined, personId: "p1", members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] }) } as express.Request, {} as express.Response)) as RegResult;
    expect(processCharge).toHaveBeenCalled();
    expect(result.status).toBe("confirmed");
  });
});

describe("register — capacity and waitlist", () => {
  it("lands on the waitlist (no charge) when full and waitlist is enabled", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", registrationEnabled: true, capacity: 1, waitlistEnabled: true }, capacityOk: false, types: [{ id: "t1", price: "45.00", active: true }] });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe("waitlisted");
    expect(processCharge).not.toHaveBeenCalled();
    expect(repos.registration.save).toHaveBeenCalled();
  });

  it("returns 409 full when capacity is reached and waitlist is disabled", async () => {
    const { controller } = makeController({ event: { id: "e1", registrationEnabled: true, capacity: 1, waitlistEnabled: false }, capacityOk: false });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", members: [{ firstName: "A", lastName: "B" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(409);
    expect(result.obj.status).toBe("full");
  });

  it("rolls back and returns 409 type-full when a per-type guard rejects", async () => {
    const { controller, repos } = makeController({ types: [{ id: "t1", price: "0", capacity: 2, active: true }], typeOk: false });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(409);
    expect(result.obj.status).toBe("type-full");
    expect(repos.registration.delete).toHaveBeenCalled();
  });
});

describe("pay", () => {
  it("charges the outstanding balance and increments amountPaid", async () => {
    processCharge.mockResolvedValue({ success: true, transactionId: "tx3", data: { id: "tx3", status: "succeeded" } });
    const { controller, repos } = makeController({ existing: { id: "r1", churchId: "c1", personId: "p1", totalAmount: 100, amountPaid: 0, status: "pending" }, auPersonId: "p1" });
    const result = (await controller.pay("r1", { body: { provider: "stripe", token: "tok" } } as express.Request, {} as express.Response)) as RegResult;
    expect(processCharge.mock.calls[0][1].amount).toBe(100);
    expect(repos.registrationPayment.save).toHaveBeenCalled();
    expect(result.amountPaid).toBe(100);
  });

  it("rejects when there is no balance due", async () => {
    const { controller } = makeController({ existing: { id: "r1", churchId: "c1", personId: "p1", totalAmount: 50, amountPaid: 50 }, auPersonId: "p1" });
    const result = (await controller.pay("r1", { body: { provider: "stripe", token: "tok" } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("No balance due");
  });
});

describe("promote", () => {
  it("returns 409 when nothing can be promoted", async () => {
    const { controller } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1" }, promoted: null });
    const result = (await controller.promote("r1", { body: null } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(409);
  });

  it("returns the promoted registration when a spot frees", async () => {
    const { controller } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1" }, promoted: { id: "r2", status: "pending", personId: "p2" } });
    const result = (await controller.promote("r1", { body: null } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe("pending");
  });
});

describe("edit", () => {
  it("recomputes totalAmount from new members without charging", async () => {
    const types = [{ id: "t1", price: "20.00", active: true }];
    const { controller, repos } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1", personId: "p1", amountPaid: 0 }, types, auPersonId: "p1", savedMembers: [{ registrationTypeId: "t1" }] });
    const result = (await controller.edit("r1", { body: { members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(processCharge).not.toHaveBeenCalled();
    expect(result.totalAmount).toBe(20);
    expect(repos.registration.save).toHaveBeenCalled();
  });
});

describe("review fixes", () => {
  it("refuses to take payment for a waitlisted registration", async () => {
    const { controller } = makeController({ existing: { id: "r1", churchId: "c1", personId: "p1", totalAmount: 100, amountPaid: 0, status: "waitlisted" }, auPersonId: "p1" });
    const result = (await controller.pay("r1", { body: { provider: "stripe", token: "tok" } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(409);
    expect(processCharge).not.toHaveBeenCalled();
  });

  it("confirms a pending registration once the balance is paid", async () => {
    processCharge.mockResolvedValue({ success: true, transactionId: "tx4", data: { id: "tx4", status: "succeeded" } });
    const { controller } = makeController({ existing: { id: "r1", churchId: "c1", personId: "p1", totalAmount: 40, amountPaid: 0, status: "pending" }, auPersonId: "p1" });
    const result = (await controller.pay("r1", { body: { provider: "stripe", token: "tok" } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe("confirmed");
  });

  it("promotes the registration staff clicked", async () => {
    const { controller, repos } = makeController({ existing: { id: "r7", churchId: "c1", eventId: "e1" }, promoted: { id: "r7", status: "pending" } });
    await controller.promote("r7", { body: null } as express.Request, {} as express.Response);
    expect(repos.registration.promoteFromWaitlist).toHaveBeenCalledWith("c1", "e1", 50, "r7");
  });

  it("restores the old members when an edit hits a type capacity", async () => {
    const types = [{ id: "t1", price: "0", capacity: 1, active: true }];
    const old = [{ id: "m1", churchId: "c1", registrationId: "r1", firstName: "Old", lastName: "Member" }];
    const { controller, repos } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1", personId: "p1" }, types, auPersonId: "p1", savedMembers: old });
    repos.registrationMember.atomicInsertWithTypeCapacity.mockImplementation(async (_m: RegistrationMember, capacity: number | null) => capacity === null);
    const result = (await controller.edit("r1", { body: { members: [{ firstName: "New", lastName: "Member", registrationTypeId: "t1" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(409);
    expect(repos.registrationMember.atomicInsertWithTypeCapacity).toHaveBeenLastCalledWith(old[0], null);
    expect(repos.registration.save).not.toHaveBeenCalled();
  });

  it("rolls back when a coupon's max uses were taken concurrently", async () => {
    const coupon = { id: "cp1", code: "X", discountType: "amount", value: "5", maxUses: 1, active: true };
    const { controller, repos } = makeController({ coupon, couponUses: 0 });
    repos.registration.countActiveForCoupon.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", couponCode: "X", members: [{ firstName: "A", lastName: "B" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(400);
    expect(repos.registration.delete).toHaveBeenCalled();
  });
});

describe("attendee person links", () => {
  it("drops member personIds outside the registrant's household", async () => {
    const { controller, repos } = makeController({ auPersonId: "p1" });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p1", members: [{ firstName: "A", lastName: "B", personId: "p1" }, { firstName: "C", lastName: "D", personId: "stranger" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.members.map((m) => m.personId)).toEqual(["p1", null]);
    expect(repos.registrationMember.atomicInsertWithTypeCapacity).toHaveBeenCalledTimes(2);
  });
});

describe("paid attendee types are required", () => {
  const types = [{ id: "t1", price: "45.00", active: true }];

  it("rejects a register that omits attendee types on a paid event", async () => {
    const { controller, repos } = makeController({ types });
    const noType = (await controller.register({ body: { churchId: "c1", eventId: "e1", guestInfo: { firstName: "G", lastName: "H", email: "g@x.com" }, members: [{ firstName: "A", lastName: "B" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(noType.status).toBe(400);
    const noMembers = (await controller.register({ body: { churchId: "c1", eventId: "e1", guestInfo: { firstName: "G", lastName: "H", email: "g@x.com" } } } as express.Request, {} as express.Response)) as RegResult;
    expect(noMembers.status).toBe(400);
    expect(repos.registration.atomicInsertWithCapacityCheck).not.toHaveBeenCalled();
  });

  it("still allows free typed events without a type", async () => {
    const { controller } = makeController({ types: [{ id: "t1", price: "0", active: true }] });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", members: [{ firstName: "A", lastName: "B" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe("confirmed");
  });

  it("rejects a self edit that strips paid types", async () => {
    const { controller } = makeController({ types, checkAccess: false, auPersonId: "p1", existing: { id: "r1", churchId: "c1", eventId: "e1", personId: "p1", totalAmount: 45, amountPaid: 0, status: "pending" } });
    const result = (await controller.edit("r1", { body: { members: [{ firstName: "A", lastName: "B" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(400);
  });
});

describe("anonymous rate limit", () => {
  it("returns 429 when the anonymous limiter is exhausted", async () => {
    consume.mockResolvedValueOnce(false);
    const { controller, repos } = makeController();
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", guestInfo: { firstName: "G", lastName: "H", email: "g@x.com" } } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(429);
    expect(repos.registration.atomicInsertWithCapacityCheck).not.toHaveBeenCalled();
  });

  it("throttles anonymous coupon validation", async () => {
    consume.mockResolvedValueOnce(false);
    const { controller } = makeController();
    const result = (await controller.validateCoupon({ body: { churchId: "c1", eventId: "e1", code: "X" } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(429);
  });
});

describe("guest registration privacy (M29)", () => {
  it("does not link household people or echo person ids to an anonymous guest", async () => {
    const { controller } = makeController({ auPersonId: "" });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", guestInfo: { firstName: "G", lastName: "H", email: "victim@x.com" }, members: [{ firstName: "Kid", lastName: "H", personId: "p1kid" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.personId).toBeUndefined();
    expect(result.householdId).toBeUndefined();
    expect(result.members[0].personId).toBeNull();
  });
});

describe("event registrations for the event's group leaders", () => {
  it("lets a leader of the event's group list its registrations", async () => {
    const { controller } = makeController({ checkAccess: false, leaderGroupIds: ["g1"], event: { id: "e1", groupId: "g1" }, existingRegs: [{ id: "r1" }] });
    const result = await controller.getForEvent("e1", {} as express.Request, {} as express.Response);
    expect((result as Registration[]).map((r) => r.id)).toEqual(["r1"]);
  });

  it("refuses a leader of a different group", async () => {
    const { controller } = makeController({ checkAccess: false, leaderGroupIds: ["g2"], event: { id: "e1", groupId: "g1" } });
    const result = await controller.getForEvent("e1", {} as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
  });
});

describe("issue 1417 — staff Add Attendee and pay later", () => {
  const types = [{ id: "t1", price: "45.00", active: true }];

  it("lets staff register another person on a paid type with a balance due and no charge", async () => {
    const { controller } = makeController({ types, auPersonId: "admin1" });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p2", members: [{ personId: "p2", firstName: "Donald", lastName: "Clark", registrationTypeId: "t1" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(processCharge).not.toHaveBeenCalled();
    expect(result.status).toBe("pending");
    expect(result.personId).toBe("p2");
    expect(result.totalAmount).toBe(45);
    expect(result.amountPaid).toBe(0);
    expect(result.members[0].personId).toBe("p2");
  });

  it("keeps the person when staff add someone to a free event", async () => {
    const { controller } = makeController({ auPersonId: "admin1" });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p2", members: [{ personId: "p2", firstName: "Sam", lastName: "Demo" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe("confirmed");
    expect(result.personId).toBe("p2");
    expect(result.members[0].personId).toBe("p2");
  });

  it("does not let a non-staff user register someone else", async () => {
    const { controller } = makeController({ auPersonId: "p1", checkAccess: false });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p2", members: [{ personId: "p2", firstName: "Sam", lastName: "Demo" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.personId).toBeNull();
  });

  it("saves a paid registration as pending with a balance due when the church has no gateway", async () => {
    (RepoManager.getRepos as jest.Mock).mockResolvedValueOnce({ gateway: { loadAll: jest.fn(async (): Promise<{ id: string; provider: string }[]> => []) } });
    const { controller } = makeController({ types, auPersonId: "" });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", guestInfo: { firstName: "G", lastName: "H", email: "g@x.com" }, members: [{ firstName: "G", lastName: "H", registrationTypeId: "t1" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(processCharge).not.toHaveBeenCalled();
    expect(result.status).toBe("pending");
    expect(result.totalAmount).toBe(45);
    expect(result.amountPaid).toBe(0);
  });

  it("still requires payment when the church has a gateway", async () => {
    (RepoManager.getRepos as jest.Mock).mockResolvedValueOnce({ gateway: { loadAll: jest.fn(async () => [{ id: "g1", provider: "stripe" }]) } });
    const { controller } = makeController({ types, auPersonId: "" });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", guestInfo: { firstName: "G", lastName: "H", email: "g@x.com" }, members: [{ firstName: "G", lastName: "H", registrationTypeId: "t1" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(400);
  });

  it("links the waitlist promotion email to the member registrations page", async () => {
    const send = RegistrationHelper.sendWaitlistAvailabilityEmail as jest.Mock;
    send.mockClear();
    const { controller } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1" }, promoted: { id: "r1", status: "pending", personId: "p2", totalAmount: 45, amountPaid: 0 } });
    await controller.promote("r1", { body: null } as express.Request, {} as express.Response);
    expect(send.mock.calls[0][3]).toBe("https://grace.b1.test/mobile/registrations");
  });
});

describe("staff restore of a cancelled registration", () => {
  const cancelled = (extra: Partial<Registration> = {}): Registration => ({ id: "r1", churchId: "c1", eventId: "e1", personId: "p2", status: "cancelled", cancelledDate: new Date(), totalAmount: 45, amountPaid: 0, ...extra });
  const restore = (controller: RegistrationController) => controller.restore("r1", { body: null } as express.Request, {} as express.Response) as Promise<RegResult>;

  it("restores to pending when a balance is due, church-scoped, with the event capacity", async () => {
    const { controller, repos } = makeController({ existing: cancelled() });
    const result = await restore(controller);
    expect(result.status).toBe("pending");
    expect(result.cancelledDate).toBeNull();
    expect(repos.registration.load).toHaveBeenCalledWith("c1", "r1");
    expect(repos.registration.restoreWithCapacityCheck).toHaveBeenCalledWith("c1", "r1", "e1", "pending", 50);
  });

  it("restores to confirmed when fully paid", async () => {
    const { controller, repos } = makeController({ existing: cancelled({ amountPaid: 45 }) });
    const result = await restore(controller);
    expect(result.status).toBe("confirmed");
    expect(repos.registration.restoreWithCapacityCheck.mock.calls[0][3]).toBe("confirmed");
  });

  it("refuses when the event is full", async () => {
    const { controller } = makeController({ existing: cancelled(), capacityOk: false });
    const result = await restore(controller);
    expect(result.status).toBe(409);
    expect(result.obj.code).toBe("event-full");
  });

  it("puts it back to cancelled when an attendee type is over capacity", async () => {
    const { controller, repos } = makeController({ existing: cancelled(), types: [{ id: "t1", price: "45", capacity: 2, active: true }], savedMembers: [{ id: "m1", registrationTypeId: "t1" }], typeCount: 3 });
    const result = await restore(controller);
    expect(result.status).toBe(409);
    expect(result.obj.code).toBe("type-full");
    expect(repos.registration.save).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", status: "cancelled" }));
  });

  it("keeps it when the attendee type still has room", async () => {
    const { controller, repos } = makeController({ existing: cancelled(), types: [{ id: "t1", price: "45", capacity: 2, active: true }], savedMembers: [{ id: "m1", registrationTypeId: "t1" }], typeCount: 2 });
    const result = await restore(controller);
    expect(result.status).toBe("pending");
    expect(repos.registration.save).not.toHaveBeenCalled();
  });

  it("refuses when the person has registered again since", async () => {
    const { controller, repos } = makeController({ existing: cancelled(), registeredPersonIds: ["p2"] });
    const result = await restore(controller);
    expect(result.status).toBe(409);
    expect(repos.registration.loadRegisteredPersonIds).toHaveBeenCalledWith("c1", "e1", ["p2"], "r1");
    expect(repos.registration.restoreWithCapacityCheck).not.toHaveBeenCalled();
  });

  it("refuses when an attendee on it has been registered again since", async () => {
    const { controller, repos } = makeController({ existing: cancelled(), savedMembers: [{ id: "m1", personId: "p2kid", firstName: "K", lastName: "D" }], registeredPersonIds: ["p2kid"] });
    const result = await restore(controller);
    expect(result.status).toBe(409);
    expect(repos.registration.loadRegisteredPersonIds).toHaveBeenCalledWith("c1", "e1", ["p2", "p2kid"], "r1");
    expect(repos.registration.restoreWithCapacityCheck).not.toHaveBeenCalled();
  });

  it("requires Registrations Edit", async () => {
    const { controller, repos } = makeController({ existing: cancelled({ personId: "p1" }), auPersonId: "p1", checkAccess: false });
    const result = await restore(controller);
    expect(result.status).toBe(401);
    expect(repos.registration.restoreWithCapacityCheck).not.toHaveBeenCalled();
  });

  it("returns 404 for a registration outside the user's church", async () => {
    const { controller, repos } = makeController({ existing: undefined });
    const result = await restore(controller);
    expect(result.status).toBe(404);
    expect(repos.registration.load).toHaveBeenCalledWith("c1", "r1");
    expect(repos.registration.restoreWithCapacityCheck).not.toHaveBeenCalled();
  });

  it("rejects a registration that is not cancelled", async () => {
    const { controller } = makeController({ existing: cancelled({ status: "confirmed" }) });
    const result = await restore(controller);
    expect(result.status).toBe(400);
  });
});

describe("delete is blocked once a registration has payments", () => {
  it("refuses with a message code and leaves the rows alone", async () => {
    const { controller, repos } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1" }, payments: [{ id: "pay1", amount: 45 }] });
    const result = (await controller.delete("r1", { body: null } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(409);
    expect(result.obj.code).toBe("registration-has-payments");
    expect(repos.registration.delete).not.toHaveBeenCalled();
    expect(repos.registrationPayment.deleteForRegistration).not.toHaveBeenCalled();
  });

  it("still deletes a registration with no payments", async () => {
    const { controller, repos } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1" } });
    await controller.delete("r1", { body: null } as express.Request, {} as express.Response);
    expect(repos.registration.delete).toHaveBeenCalledWith("c1", "r1");
  });
});

describe("staff edit of a registration", () => {
  const types = [{ id: "t1", price: "45.00", capacity: 6, active: true }, { id: "t2", price: "20.00", capacity: 1, active: true }];
  const existing = (): Registration => ({ id: "r1", churchId: "c1", eventId: "e1", personId: "p2", status: "pending", totalAmount: 45, amountPaid: 0 });

  it("recalculates the total when staff change types and add a person", async () => {
    const savedMembers = [{ firstName: "A", lastName: "B", registrationTypeId: "t2" }, { firstName: "C", lastName: "D", registrationTypeId: "t1" }];
    const { controller } = makeController({ types, existing: existing(), savedMembers });
    const result = (await controller.edit("r1", { body: { members: savedMembers } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.totalAmount).toBe(65);
  });

  it("enforces attendee type capacity for staff", async () => {
    const { controller } = makeController({ types, existing: existing(), typeOk: false });
    const result = (await controller.edit("r1", { body: { members: [{ firstName: "A", lastName: "B", registrationTypeId: "t2" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(409);
  });
});

describe("household members already registered", () => {
  it("checks only the caller's own household, in the caller's church", async () => {
    mockLoadHouseholdPeople.mockClear();
    const { controller, repos } = makeController({ auPersonId: "p1", registeredPersonIds: ["p1kid", "stranger"] });
    const result = await controller.getHouseholdRegisteredForEvent("e1", {} as express.Request, {} as express.Response);
    expect(mockLoadHouseholdPeople).toHaveBeenCalledWith("c1", ["p1"]);
    expect(repos.registration.loadRegisteredPersonIds).toHaveBeenCalledWith("c1", "e1", ["p1", "p1kid"]);
    expect(result).toEqual({ personIds: ["p1kid"] });
  });

  it("returns nothing for a login with no person record", async () => {
    const { controller, repos } = makeController({ auPersonId: "" });
    const result = await controller.getHouseholdRegisteredForEvent("e1", {} as express.Request, {} as express.Response);
    expect(result).toEqual({ personIds: [] });
    expect(repos.registration.loadRegisteredPersonIds).not.toHaveBeenCalled();
  });

  it("refuses to register a household child who is already on an active registration", async () => {
    const { controller, repos } = makeController({ auPersonId: "p1", checkAccess: false, registeredPersonIds: ["p1kid"] });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p1", members: [{ firstName: "A", lastName: "B", personId: "p1" }, { firstName: "Kid", lastName: "B", personId: "p1kid" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(409);
    expect(result.obj).toMatchObject({ status: "already-registered", personIds: ["p1kid"] });
    expect(repos.registration.loadRegisteredPersonIds).toHaveBeenCalledWith("c1", "e1", ["p1", "p1kid"]);
    expect(repos.registration.atomicInsertWithCapacityCheck).not.toHaveBeenCalled();
  });

  it("refuses a staff add of someone already registered", async () => {
    const { controller, repos } = makeController({ auPersonId: "admin1", registeredPersonIds: ["p2"] });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p2", members: [{ personId: "p2", firstName: "Sam", lastName: "Demo" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(409);
    expect(repos.registration.atomicInsertWithCapacityCheck).not.toHaveBeenCalled();
  });

  it("registers household people who are not yet on a registration", async () => {
    const { controller } = makeController({ auPersonId: "p1", checkAccess: false, registeredPersonIds: ["someoneElse"] });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p1", members: [{ firstName: "A", lastName: "B", personId: "p1" }, { firstName: "Kid", lastName: "B", personId: "p1kid" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe("confirmed");
  });

  it("refuses an edit that adds someone already on another registration, before touching members", async () => {
    const { controller, repos } = makeController({ auPersonId: "p1", checkAccess: false, registeredPersonIds: ["p1kid"], existing: { id: "r1", churchId: "c1", eventId: "e1", personId: "p1", status: "confirmed" } });
    const result = (await controller.edit("r1", { body: { members: [{ firstName: "A", lastName: "B", personId: "p1" }, { firstName: "Kid", lastName: "B", personId: "p1kid" }] } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(409);
    expect(repos.registration.loadRegisteredPersonIds).toHaveBeenCalledWith("c1", "e1", ["p1", "p1kid"], "r1");
    expect(repos.registrationMember.deleteForRegistration).not.toHaveBeenCalled();
  });
});

describe("answering questions after signup", () => {
  it("lets the registrant link a form submission without repricing the registration", async () => {
    const types = [{ id: "t1", price: "60.00", active: true }];
    const { controller, repos } = makeController({ types, auPersonId: "p1", checkAccess: false, savedMembers: [{ registrationTypeId: "t1" }], existing: { id: "r1", churchId: "c1", eventId: "e1", personId: "p1", totalAmount: 45, amountPaid: 45, status: "confirmed" } });
    const result = (await controller.edit("r1", { body: { formSubmissionId: "fs1" } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.formSubmissionId).toBe("fs1");
    expect(result.totalAmount).toBe(45);
    expect(repos.registration.save).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", formSubmissionId: "fs1", totalAmount: 45 }));
  });

  it("refuses to link answers to someone else's registration", async () => {
    const { controller, repos } = makeController({ auPersonId: "p9", checkAccess: false, existing: { id: "r1", churchId: "c1", eventId: "e1", personId: "p1", status: "confirmed" } });
    const result = (await controller.edit("r1", { body: { formSubmissionId: "fs1" } } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(401);
    expect(repos.registration.save).not.toHaveBeenCalled();
  });
});

describe("cancel fires registration.cancelled", () => {
  const emit = WebhookDispatcher.emit as jest.Mock;
  beforeEach(() => emit.mockClear());

  it("emits once, with the members, when a registration is cancelled", async () => {
    const members = [{ id: "m1", firstName: "A", lastName: "B" }];
    const { controller } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1", personId: "p1", status: "confirmed" }, savedMembers: members });
    const result = (await controller.cancel("r1", { body: null } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe("cancelled");
    const cancelled = emit.mock.calls.filter((c) => c[1] === "registration.cancelled");
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0][0]).toBe("c1");
    expect(cancelled[0][2]).toMatchObject({ id: "r1", eventId: "e1", personId: "p1", status: "cancelled", members });
  });

  it("does not emit when the registration was already cancelled", async () => {
    const { controller, repos } = makeController({ existing: { id: "r1", churchId: "c1", eventId: "e1", personId: "p1", status: "cancelled" } });
    const result = (await controller.cancel("r1", { body: null } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(400);
    expect(repos.registration.save).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("balance reminders", () => {
  const send = RegistrationHelper.sendBalanceReminderEmail as jest.Mock;
  beforeEach(() => { send.mockClear(); loadPersonMock.mockClear(); });

  const regs: Registration[] = [
    { id: "owes", churchId: "c1", eventId: "e1", personId: "p1", status: "pending", totalAmount: "45.00" as unknown as number, amountPaid: "20.00" as unknown as number },
    { id: "confirmedOwes", churchId: "c1", eventId: "e1", personId: "p2", status: "confirmed", totalAmount: 30, amountPaid: 0 },
    { id: "paid", churchId: "c1", eventId: "e1", personId: "p3", status: "confirmed", totalAmount: 45, amountPaid: 45 },
    { id: "free", churchId: "c1", eventId: "e1", personId: "p4", status: "confirmed", totalAmount: 0, amountPaid: 0 },
    { id: "cancelled", churchId: "c1", eventId: "e1", personId: "p5", status: "cancelled", totalAmount: 45, amountPaid: 0 },
    { id: "waitlisted", churchId: "c1", eventId: "e1", personId: "p6", status: "waitlisted", totalAmount: 45, amountPaid: 0 }
  ];

  it("emails each active registrant with a balance their total, paid, balance and pay link", async () => {
    const { controller, repos } = makeController({ existingRegs: regs, event: { id: "e1", title: "Camp" } });
    const result = (await controller.sendBalanceReminders("e1", { body: null } as express.Request, {} as express.Response)) as { sent: number };
    expect(result).toEqual({ sent: 2 });
    expect(repos.event.load).toHaveBeenCalledWith("c1", "e1");
    expect(repos.registration.loadForEvent).toHaveBeenCalledWith("c1", "e1");
    expect(loadPersonMock.mock.calls.map((c) => c[1])).toEqual(["p1", "p2"]);
    expect(loadPersonMock.mock.calls.every((c) => c[0] === "c1")).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    const [email, churchName, event, amounts, payUrl] = send.mock.calls[0];
    expect(email).toBe("person@example.com");
    expect(churchName).toBe("Grace");
    expect(event.title).toBe("Camp");
    expect(amounts).toEqual({ total: "$45.00", paid: "$20.00", balance: "$25.00" });
    expect(payUrl).toBe("https://grace.b1.test/mobile/registrations");
    expect(send.mock.calls[1][3]).toEqual({ total: "$30.00", paid: "$0.00", balance: "$30.00" });
  });

  it("does not count registrants without an email", async () => {
    loadPersonMock.mockResolvedValueOnce({ householdId: "h1", email: "" });
    const { controller } = makeController({ existingRegs: regs, event: { id: "e1", title: "Camp" } });
    const result = (await controller.sendBalanceReminders("e1", { body: null } as express.Request, {} as express.Response)) as { sent: number };
    expect(result).toEqual({ sent: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("requires Registrations Edit", async () => {
    const { controller, repos } = makeController({ existingRegs: regs, checkAccess: false });
    const result = (await controller.sendBalanceReminders("e1", { body: null } as express.Request, {} as express.Response)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.registration.loadForEvent).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 404 for an event outside the staff member's church", async () => {
    const { controller, repos } = makeController({ existingRegs: regs });
    repos.event.load.mockResolvedValueOnce(null);
    const result = (await controller.sendBalanceReminders("other", { body: null } as express.Request, {} as express.Response)) as JsonResult;
    expect(result.status).toBe(404);
    expect(repos.event.load).toHaveBeenCalledWith("c1", "other");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("member self-cancel setting", () => {
  const existing = { id: "r1", churchId: "c1", eventId: "e1", personId: "p1", status: "confirmed" };

  it("refuses a member's own cancel when the event turns self-cancel off", async () => {
    const { controller, repos } = makeController({ existing, auPersonId: "p1", checkAccess: false, event: { id: "e1", registrationEnabled: true, allowSelfCancel: false } });
    const result = (await controller.cancel("r1", { body: null } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(403);
    expect(repos.registration.save).not.toHaveBeenCalled();
  });

  it("still lets staff cancel when self-cancel is off", async () => {
    const { controller, repos } = makeController({ existing: { ...existing }, auPersonId: "admin1", checkAccess: true, event: { id: "e1", registrationEnabled: true, allowSelfCancel: false } });
    const result = (await controller.cancel("r1", { body: null } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe("cancelled");
    expect(repos.registration.save).toHaveBeenCalled();
  });

  it("lets a member cancel when the setting is on or the event predates it", async () => {
    for (const event of [{ id: "e1", allowSelfCancel: true }, { id: "e1" }]) {
      const { controller } = makeController({ existing: { ...existing }, auPersonId: "p1", checkAccess: false, event });
      const result = (await controller.cancel("r1", { body: null } as express.Request, {} as express.Response)) as RegResult;
      expect(result.status).toBe("cancelled");
    }
  });
});

describe("pay later setting", () => {
  const types = [{ id: "t1", price: "45.00", active: true }];
  const body = { churchId: "c1", eventId: "e1", personId: "p1", payLater: true, members: [{ firstName: "A", lastName: "B", registrationTypeId: "t1" }] };

  it("saves a pay-later registration with the full balance due when the event allows it", async () => {
    const { controller } = makeController({ types, auPersonId: "p1", checkAccess: false, event: { id: "e1", registrationEnabled: true, allowPayLater: true } });
    const result = (await controller.register({ body } as express.Request, {} as express.Response)) as RegResult;
    expect(processCharge).not.toHaveBeenCalled();
    expect(result.status).toBe("pending");
    expect(result.totalAmount).toBe(45);
    expect(result.amountPaid).toBe(0);
  });

  it("refuses pay later when the church has a gateway and the event does not allow it", async () => {
    const { controller, repos } = makeController({ types, auPersonId: "p1", checkAccess: false, event: { id: "e1", registrationEnabled: true } });
    const result = (await controller.register({ body } as express.Request, {} as express.Response)) as RegResult;
    expect(result.status).toBe(400);
    expect(processCharge).not.toHaveBeenCalled();
    expect(repos.registration.atomicInsertWithCapacityCheck).not.toHaveBeenCalled();
  });

  it("accepts pay later without the setting when the church has no gateway", async () => {
    (RepoManager.getRepos as jest.Mock).mockResolvedValueOnce({ gateway: { loadAll: jest.fn(async (): Promise<{ id: string; provider: string }[]> => []) } });
    const { controller } = makeController({ types, auPersonId: "p1", checkAccess: false, event: { id: "e1", registrationEnabled: true } });
    const result = (await controller.register({ body } as express.Request, {} as express.Response)) as RegResult;
    expect(processCharge).not.toHaveBeenCalled();
    expect(result.status).toBe("pending");
  });
});

describe("attendee type deposits", () => {
  const types = [{ id: "camper", price: "300.00", depositAmount: "50.00", active: true }, { id: "leader", price: "100.00", active: true }];
  const selections = [{ id: "shirt", price: 15, active: true }];
  const member = (registrationTypeId: string) => ({ firstName: "A", lastName: "B", registrationTypeId });

  it("charges each deposit attendee's deposit plus full price for the rest, ignoring a client amount, and leaves a balance", async () => {
    processCharge.mockResolvedValue({ success: true, transactionId: "tx9", data: { id: "tx9", status: "succeeded" } });
    const { controller, repos } = makeController({ types, selections, auPersonId: "p1" });
    const result = (await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", amount: 1, members: [member("camper"), member("camper"), member("leader")], selections: [{ selectionId: "shirt", quantity: 2 }] } } as express.Request, {} as express.Response)) as RegResult;
    // 2 x 50 deposit + 100 leader + 2 x 15 shirts
    expect(processCharge.mock.calls[0][1].amount).toBe(230);
    expect((repos.registrationPayment.save.mock.calls[0] as RegistrationPayment[])[0].amount).toBe(230);
    expect(result.totalAmount).toBe(730);
    expect(result.amountPaid).toBe(230);
  });

  it("never charges more than the discounted total", async () => {
    processCharge.mockResolvedValue({ success: true, transactionId: "tx10", data: { id: "tx10", status: "succeeded" } });
    const coupon = { id: "cp1", discountType: "amount", value: 280, active: true };
    const { controller } = makeController({ types, coupon, auPersonId: "p1" });
    await controller.register({ body: { churchId: "c1", eventId: "e1", personId: "p1", provider: "stripe", token: "tok", couponCode: "X", members: [member("camper")] } } as express.Request, {} as express.Response);
    expect(processCharge.mock.calls[0][1].amount).toBe(20);
  });

  it("lets the member pay the remaining balance after a deposit", async () => {
    processCharge.mockResolvedValue({ success: true, transactionId: "tx11", data: { id: "tx11", status: "succeeded" } });
    const { controller } = makeController({ existing: { id: "r1", churchId: "c1", personId: "p1", totalAmount: 300, amountPaid: 50, status: "confirmed" }, auPersonId: "p1" });
    const result = (await controller.pay("r1", { body: { provider: "stripe", token: "tok" } } as express.Request, {} as express.Response)) as RegResult;
    expect(processCharge.mock.calls[0][1].amount).toBe(250);
    expect(result.amountPaid).toBe(300);
  });

  it("rejects saving a deposit above the type price", async () => {
    const { controller, repos } = makeController();
    const save = jest.fn();
    Object.assign(repos, { registrationType: { ...repos.registrationType, save } });
    const result = (await controller.saveType({ body: [{ name: "Camper", price: 100, depositAmount: 150 }] } as express.Request, {} as express.Response)) as unknown as JsonResult;
    expect(result.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
});
