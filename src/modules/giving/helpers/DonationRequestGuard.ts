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

  static resolvePersonId(requestedPersonId: string | undefined, au: { id?: string; personId?: string }, canEditDonations: boolean): string | undefined {
    if (!au?.id || canEditDonations) return requestedPersonId;
    return au.personId || "";
  }
}
