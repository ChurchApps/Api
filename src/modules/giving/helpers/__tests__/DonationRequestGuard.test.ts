import { DonationRequestGuard } from "../DonationRequestGuard";

describe("DonationRequestGuard.validateFunds", () => {
  it("accepts splits equal to or below the charged amount", () => {
    expect(DonationRequestGuard.validateFunds(10, [{ id: "a", amount: 6 }, { id: "b", amount: 4 }])).toBeNull();
    expect(DonationRequestGuard.validateFunds(10.33, [{ id: "a", amount: 10 }])).toBeNull();
  });

  it("rejects splits above the charged amount", () => {
    expect(DonationRequestGuard.validateFunds(1, [{ id: "a", amount: 10000 }])).toMatch(/exceed/);
    expect(DonationRequestGuard.validateFunds(10, [{ id: "a", amount: 5 }, { id: "b", amount: 5.01 }])).toMatch(/exceed/);
  });

  it("rejects negative, missing or non-numeric amounts", () => {
    expect(DonationRequestGuard.validateFunds(10, [{ id: "a", amount: 20 }, { id: "b", amount: -10 }])).not.toBeNull();
    expect(DonationRequestGuard.validateFunds(10, [])).not.toBeNull();
    expect(DonationRequestGuard.validateFunds(0, [{ id: "a", amount: 0 }])).not.toBeNull();
    expect(DonationRequestGuard.validateFunds("x", [{ id: "a", amount: 1 }])).not.toBeNull();
  });
});

describe("DonationRequestGuard.resolvePersonId", () => {
  it("forces a signed-in donor to their own person", () => {
    expect(DonationRequestGuard.resolvePersonId("victim", { id: "u1", personId: "me" }, false)).toBe("me");
  });

  it("lets donation editors attribute to anyone", () => {
    expect(DonationRequestGuard.resolvePersonId("other", { id: "u1", personId: "me" }, true)).toBe("other");
  });

  it("leaves guest checkout attribution alone", () => {
    expect(DonationRequestGuard.resolvePersonId("guest", {}, false)).toBe("guest");
  });
});
