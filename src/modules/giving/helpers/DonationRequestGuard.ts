export class DonationRequestGuard {
  // Fund splits may be below the charged total (donor-covered fees) but never above it.
  static validateFunds(amount: any, funds: any): string | null {
    const total = Number(amount);
    if (!Number.isFinite(total) || total <= 0) return "Invalid amount";
    if (!Array.isArray(funds) || funds.length === 0) return "At least one fund is required";
    let sum = 0;
    for (const f of funds) {
      const a = Number(f?.amount);
      if (!Number.isFinite(a) || a < 0) return "Invalid fund amount";
      sum += a;
    }
    if (sum <= 0) return "Invalid fund amount";
    if (Math.round(sum * 100) > Math.round(total * 100)) return "Fund amounts exceed the donation amount";
    return null;
  }

  // Guests always tokenize a fresh method. Saved KF vaults / Paystack authorizations are keyed by person, which a guest
  // can claim by id, so they're login-only. Stripe guests legitimately pass the customerId minted by /addcard.
  static stripGuestSavedMethod(data: any, provider: string): boolean {
    const p = (provider || "").toLowerCase();
    delete data.saveCard;
    delete data.paymentMethodId;
    if (p === "stripe") return true;
    delete data.customerId;
    const id = String(data.id || "");
    if (p === "kingdomfunding" && /^\d+$/.test(id)) return false;
    if (p === "paystack" && /^AUTH_/.test(id)) return false;
    return true;
  }

  static recentCustomerMs = 60 * 60 * 1000;

  // Without donations.edit a request may only charge a saved method/customer the caller owns. Stripe guests have no
  // owned customer, so they may use one the gateway created moments ago (the /addcard or ach-setup-intent-anon they just ran).
  static async savedMethodAllowed(
    data: any,
    gateway: { id?: string; churchId?: string; provider?: string },
    au: { id?: string; personId?: string },
    canEditDonations: boolean,
    repos: any,
    customerCreatedAt: (customerId: string) => Promise<Date | null>
  ): Promise<boolean> {
    if (canEditDonations) return true;
    const churchId = gateway.churchId as string;
    const ownsCustomer = async (customerId: string) => {
      if (!au?.personId || !customerId) return false;
      const customer: any = await repos.customer.load(churchId, String(customerId));
      return !!customer && customer.personId === au.personId;
    };
    const p = (gateway.provider || "").toLowerCase();
    if (p === "stripe") {
      if (!data.customerId || await ownsCustomer(data.customerId)) return true;
      const created = await customerCreatedAt(String(data.customerId));
      return !!created && Date.now() - created.getTime() < this.recentCustomerMs;
    }
    if (!au?.id || (p !== "kingdomfunding" && p !== "paystack")) return true;
    if (data.customerId && !(await ownsCustomer(data.customerId))) delete data.customerId;
    const id = String(data.id || "");
    const savedId = data.paymentMethodId || ((p === "kingdomfunding" && /^\d+$/.test(id)) || (p === "paystack" && /^AUTH_/.test(id)) ? id : "");
    if (!savedId) return true;
    const record: any = await repos.gatewayPaymentMethod.loadByExternalId(churchId, gateway.id, String(savedId));
    return !!record && await ownsCustomer(record.customerId);
  }

  static resolvePersonId(requestedPersonId: string | undefined, au: { id?: string; personId?: string }, canEditDonations: boolean): string | undefined {
    if (!au?.id || canEditDonations) return requestedPersonId;
    return au.personId || "";
  }
}
