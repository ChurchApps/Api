import { Registration, RegistrationPayment } from "../models/index.js";
import { RegistrationPricingHelper } from "./RegistrationPricingHelper.js";

const OFFLINE_PAYMENT_METHODS = ["cash", "check", "other"] as const;
export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number];

// Balance and refund math for a registration's payment ledger (registrationPayments rows).
// Online charges are kind "charge", staff-recorded payments kind "payment", and both are reversed by kind "refund".
export class RegistrationPaymentHelper {
  // A refund still waiting on the gateway blocks another refund on the same registration for this long;
  // after that it only keeps its amount reserved, so a request that died mid-call can't lock staff out.
  static readonly PENDING_REFUND_BLOCK_MS = 15 * 60 * 1000;
  // An identical payment or refund keyed in again this soon is treated as a double submit.
  static readonly DUPLICATE_WINDOW_MS = 60 * 1000;

  static parseAmount(value: unknown): number | null {
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
    if (Math.abs(RegistrationPricingHelper.round(n) - n) > 1e-9) return null;
    return RegistrationPricingHelper.round(n);
  }

  static parseOfflineMethod(value: unknown): OfflinePaymentMethod | null {
    const method = typeof value === "string" ? value.trim().toLowerCase() : "";
    return (OFFLINE_PAYMENT_METHODS as readonly string[]).includes(method) ? (method as OfflinePaymentMethod) : null;
  }

  // Only checks carry a reference number; it is stored as the row's transactionId.
  static checkReference(method: OfflinePaymentMethod, checkNumber: unknown): string | null {
    if (method !== "check" || typeof checkNumber !== "string") return null;
    const trimmed = checkNumber.trim().slice(0, 100);
    return trimmed || null;
  }

  static balanceDue(registration: Pick<Registration, "totalAmount" | "amountPaid">): number {
    return RegistrationPricingHelper.round(RegistrationPricingHelper.num(registration.totalAmount) - RegistrationPricingHelper.num(registration.amountPaid));
  }

  // Same rule the online pay path uses: a pending registration is confirmed once it is paid in full.
  static statusAfterPayment(registration: Pick<Registration, "status" | "totalAmount">, newAmountPaid: number): string {
    if (registration.status === "pending" && newAmountPaid >= RegistrationPricingHelper.round(RegistrationPricingHelper.num(registration.totalAmount))) return "confirmed";
    return registration.status;
  }

  static isRefund(payment: RegistrationPayment): boolean {
    return payment.kind === "refund";
  }

  // An online charge the gateway can reverse; offline payments are refunded with an offline refund instead.
  static isGatewayPayment(payment: RegistrationPayment): boolean {
    return !this.isRefund(payment) && !!payment.provider && !!payment.transactionId && (payment.status || "succeeded") === "succeeded";
  }

  // Gateway refunds are stored under the refunded charge's transactionId, which ties them to it.
  static refundedAgainst(payment: RegistrationPayment, payments: RegistrationPayment[]): number {
    const total = payments
      .filter((p) => this.isRefund(p) && !!p.provider && p.transactionId === payment.transactionId && p.status !== "failed")
      .reduce((sum, p) => sum + RegistrationPricingHelper.num(p.amount), 0);
    return RegistrationPricingHelper.round(total);
  }

  // Never more than what is left of this charge, nor more than the registration has paid on net.
  static refundableForPayment(payment: RegistrationPayment, payments: RegistrationPayment[], amountPaid: unknown): number {
    const leftOnCharge = RegistrationPricingHelper.num(payment.amount) - this.refundedAgainst(payment, payments);
    return Math.max(0, RegistrationPricingHelper.round(Math.min(leftOnCharge, RegistrationPricingHelper.num(amountPaid))));
  }

  static hasRecentDuplicate(payments: RegistrationPayment[], candidate: Pick<RegistrationPayment, "kind" | "method" | "amount" | "transactionId">, now: Date = new Date()): boolean {
    return payments.some((p) => p.kind === candidate.kind
      && (p.method || null) === (candidate.method || null)
      && (p.transactionId || null) === (candidate.transactionId || null)
      && RegistrationPricingHelper.round(RegistrationPricingHelper.num(p.amount)) === RegistrationPricingHelper.round(RegistrationPricingHelper.num(candidate.amount))
      && !!p.createdDate && now.getTime() - new Date(p.createdDate).getTime() < this.DUPLICATE_WINDOW_MS);
  }
}
