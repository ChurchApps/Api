import { RegistrationPaymentHelper } from "../RegistrationPaymentHelper.js";
import { RegistrationPayment } from "../../models/index.js";

// MySQL DECIMAL columns arrive as strings.
const dec = (v: string) => v as unknown as number;

describe("RegistrationPaymentHelper.parseAmount", () => {
  it("accepts positive amounts with at most two decimals", () => {
    expect(RegistrationPaymentHelper.parseAmount(12.5)).toBe(12.5);
    expect(RegistrationPaymentHelper.parseAmount("0.01")).toBe(0.01);
  });

  it("rejects zero, negatives, extra decimals and non-numbers", () => {
    for (const v of [
      0, -1, 1.005, "", "abc", null, undefined, NaN, Infinity
    ]) expect(RegistrationPaymentHelper.parseAmount(v)).toBeNull();
  });
});

describe("RegistrationPaymentHelper.statusAfterPayment", () => {
  it("confirms a pending registration only when paid in full", () => {
    expect(RegistrationPaymentHelper.statusAfterPayment({ status: "pending", totalAmount: dec("45.00") }, 44.99)).toBe("pending");
    expect(RegistrationPaymentHelper.statusAfterPayment({ status: "pending", totalAmount: dec("45.00") }, 45)).toBe("confirmed");
    expect(RegistrationPaymentHelper.statusAfterPayment({ status: "waitlisted", totalAmount: 45 }, 45)).toBe("waitlisted");
  });
});

describe("RegistrationPaymentHelper.refundableForPayment", () => {
  const charge: RegistrationPayment = { id: "p1", kind: "charge", provider: "stripe", transactionId: "pi_1", amount: dec("45.00") };

  it("subtracts earlier gateway refunds on the same charge only", () => {
    const payments: RegistrationPayment[] = [
      charge,
      { kind: "refund", provider: "stripe", transactionId: "pi_1", amount: dec("10.00"), status: "succeeded" },
      { kind: "refund", provider: "stripe", transactionId: "pi_2", amount: dec("5.00"), status: "succeeded" },
      { kind: "refund", method: "check", transactionId: "pi_1", amount: dec("3.00"), status: "succeeded" }
    ];
    expect(RegistrationPaymentHelper.refundableForPayment(charge, payments, 45)).toBe(35);
  });

  it("counts a pending refund as already taken", () => {
    const payments: RegistrationPayment[] = [charge, { kind: "refund", provider: "stripe", transactionId: "pi_1", amount: 20, status: "pending" }];
    expect(RegistrationPaymentHelper.refundableForPayment(charge, payments, 45)).toBe(25);
  });

  it("never exceeds what the registration has paid on net", () => {
    expect(RegistrationPaymentHelper.refundableForPayment(charge, [charge], dec("12.00"))).toBe(12);
    expect(RegistrationPaymentHelper.refundableForPayment(charge, [charge], 0)).toBe(0);
  });
});

describe("RegistrationPaymentHelper.isGatewayPayment", () => {
  it("is true only for settled online charges", () => {
    expect(RegistrationPaymentHelper.isGatewayPayment({ kind: "charge", provider: "stripe", transactionId: "pi_1", status: "succeeded" })).toBe(true);
    expect(RegistrationPaymentHelper.isGatewayPayment({ kind: "payment", method: "check", transactionId: "1042", status: "succeeded" })).toBe(false);
    expect(RegistrationPaymentHelper.isGatewayPayment({ kind: "refund", provider: "stripe", transactionId: "pi_1", status: "succeeded" })).toBe(false);
    expect(RegistrationPaymentHelper.isGatewayPayment({ kind: "charge", provider: "stripe", transactionId: "pi_1", status: "pending" })).toBe(false);
  });
});

describe("RegistrationPaymentHelper.hasRecentDuplicate", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const row: RegistrationPayment = { kind: "payment", method: "check", transactionId: "7", amount: dec("10.00"), createdDate: new Date("2026-11-23T11:59:30Z") };

  it("matches the same payment keyed in again within a minute", () => {
    expect(RegistrationPaymentHelper.hasRecentDuplicate([row], { kind: "payment", method: "check", transactionId: "7", amount: 10 }, now)).toBe(true);
  });

  it("ignores older rows and different details", () => {
    expect(RegistrationPaymentHelper.hasRecentDuplicate([{ ...row, createdDate: new Date("2026-11-23T11:58:00Z") }], { kind: "payment", method: "check", transactionId: "7", amount: 10 }, now)).toBe(false);
    expect(RegistrationPaymentHelper.hasRecentDuplicate([row], { kind: "payment", method: "check", transactionId: "8", amount: 10 }, now)).toBe(false);
    expect(RegistrationPaymentHelper.hasRecentDuplicate([row], { kind: "refund", method: "check", transactionId: "7", amount: 10 }, now)).toBe(false);
  });
});
