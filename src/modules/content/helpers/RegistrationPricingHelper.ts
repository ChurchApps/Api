import { RegistrationType, RegistrationSelection, RegistrationCoupon } from "../models/index.js";

export interface CouponValidation {
  valid: boolean;
  reason?: string;
  discountType?: string;
  value?: number;
}

// Pure pricing/discount math. Prices arrive from MySQL DECIMAL columns as strings,
// so every amount is coerced with Number() before arithmetic.
export class RegistrationPricingHelper {
  static num(value: any): number {
    const n = Number(value);
    return isNaN(n) ? 0 : n;
  }

  static round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  static computeTotal(
    types: RegistrationType[],
    selections: RegistrationSelection[],
    members: { registrationTypeId?: string }[],
    choices: { selectionId?: string; quantity?: number }[]
  ): number {
    const typeMap = new Map(types.map((t) => [t.id, t]));
    const selMap = new Map(selections.map((s) => [s.id, s]));
    let total = 0;
    for (const m of members || []) {
      const t = m.registrationTypeId ? typeMap.get(m.registrationTypeId) : undefined;
      if (t) total += this.num(t.price);
    }
    for (const c of choices || []) {
      const s = c.selectionId ? selMap.get(c.selectionId) : undefined;
      if (s) total += this.num(s.price) * (c.quantity ?? 1);
    }
    return this.round(total);
  }

  static validateCoupon(coupon: RegistrationCoupon | null | undefined, memberCount: number, usesCount: number, now: Date = new Date()): CouponValidation {
    if (!coupon || !coupon.id) return { valid: false, reason: "not-found" };
    if (coupon.active === false) return { valid: false, reason: "inactive" };
    if (coupon.startDate && new Date(coupon.startDate) > now) return { valid: false, reason: "not-started" };
    if (coupon.endDate && new Date(coupon.endDate) < now) return { valid: false, reason: "expired" };
    if (coupon.minMembers != null && memberCount < coupon.minMembers) return { valid: false, reason: "min-members" };
    if (coupon.maxUses != null && usesCount >= coupon.maxUses) return { valid: false, reason: "max-uses" };
    return { valid: true, discountType: coupon.discountType, value: this.num(coupon.value) };
  }

  static applyDiscount(total: number, coupon: RegistrationCoupon | null | undefined): number {
    if (!coupon) return this.round(total);
    const value = this.num(coupon.value);
    let discounted = total;
    if (coupon.discountType === "percent") discounted = total - total * (value / 100);
    else if (coupon.discountType === "amount") discounted = total - value;
    return this.round(Math.max(0, discounted));
  }
}
