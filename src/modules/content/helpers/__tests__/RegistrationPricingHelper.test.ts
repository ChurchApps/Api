import { RegistrationPricingHelper } from "../RegistrationPricingHelper.js";

const types = [
  { id: "t1", price: "45.00", capacity: 6 },
  { id: "t2", price: "15.00", capacity: null },
  { id: "t3", price: null }
] as any[];

const selections = [
  { id: "s1", price: "12.00" },
  { id: "s2", price: null }
] as any[];

describe("RegistrationPricingHelper.computeTotal", () => {
  it("sums typed members and quantity-weighted selections (DECIMAL strings coerced)", () => {
    const members = [{ registrationTypeId: "t1" }, { registrationTypeId: "t2" }];
    const choices = [{ selectionId: "s1", quantity: 2 }];
    // 45 + 15 + 12*2 = 84
    expect(RegistrationPricingHelper.computeTotal(types, selections, members, choices)).toBe(84);
  });

  it("returns 0 when there are no types or selections (today's free-event behavior)", () => {
    expect(RegistrationPricingHelper.computeTotal([], [], [{ firstName: "A" } as any], [])).toBe(0);
  });

  it("treats null prices as 0 and defaults quantity to 1", () => {
    const members = [{ registrationTypeId: "t3" }];
    const choices = [{ selectionId: "s2" }, { selectionId: "s1" }];
    // 0 + 0 + 12 = 12
    expect(RegistrationPricingHelper.computeTotal(types, selections, members, choices)).toBe(12);
  });

  it("ignores unknown type/selection ids", () => {
    const members = [{ registrationTypeId: "nope" }];
    const choices = [{ selectionId: "ghost", quantity: 3 }];
    expect(RegistrationPricingHelper.computeTotal(types, selections, members, choices)).toBe(0);
  });
});

describe("RegistrationPricingHelper.applyDiscount", () => {
  it("applies a percent discount", () => {
    expect(RegistrationPricingHelper.applyDiscount(100, { discountType: "percent", value: 10 } as any)).toBe(90);
  });
  it("applies a fixed-amount discount", () => {
    expect(RegistrationPricingHelper.applyDiscount(100, { discountType: "amount", value: 25 } as any)).toBe(75);
  });
  it("never drives the total below 0", () => {
    expect(RegistrationPricingHelper.applyDiscount(20, { discountType: "amount", value: 50 } as any)).toBe(0);
  });
  it("returns the total unchanged with no coupon", () => {
    expect(RegistrationPricingHelper.applyDiscount(42.5, null)).toBe(42.5);
  });
});

describe("RegistrationPricingHelper.validateCoupon", () => {
  const now = new Date("2026-07-03T12:00:00Z");
  const base = { id: "c1", discountType: "percent", value: 10, active: true } as any;

  it("accepts a valid coupon", () => {
    expect(RegistrationPricingHelper.validateCoupon(base, 2, 0, now)).toMatchObject({ valid: true, discountType: "percent", value: 10 });
  });
  it("rejects a missing coupon", () => {
    expect(RegistrationPricingHelper.validateCoupon(null, 1, 0, now)).toMatchObject({ valid: false, reason: "not-found" });
  });
  it("rejects an inactive coupon", () => {
    expect(RegistrationPricingHelper.validateCoupon({ ...base, active: false }, 1, 0, now).reason).toBe("inactive");
  });
  it("rejects a not-yet-started coupon", () => {
    expect(RegistrationPricingHelper.validateCoupon({ ...base, startDate: new Date("2026-08-01") }, 1, 0, now).reason).toBe("not-started");
  });
  it("rejects an expired coupon", () => {
    expect(RegistrationPricingHelper.validateCoupon({ ...base, endDate: new Date("2026-06-01") }, 1, 0, now).reason).toBe("expired");
  });
  it("rejects below the minimum member count", () => {
    expect(RegistrationPricingHelper.validateCoupon({ ...base, minMembers: 3 }, 2, 0, now).reason).toBe("min-members");
  });
  it("rejects once max uses is reached", () => {
    expect(RegistrationPricingHelper.validateCoupon({ ...base, maxUses: 2 }, 1, 2, now).reason).toBe("max-uses");
  });
  it("allows the final use just under maxUses", () => {
    expect(RegistrationPricingHelper.validateCoupon({ ...base, maxUses: 2 }, 1, 1, now).valid).toBe(true);
  });
});
