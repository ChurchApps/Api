import { MessagingSafetyHelper } from "../MessagingSafetyHelper.js";

const yearsAgo = (years: number, offsetDays = 0) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + offsetDays);
  return d;
};

describe("MessagingSafetyHelper", () => {
  describe("parseMinimumAge", () => {
    it("defaults to 18 when unset", () => {
      expect(MessagingSafetyHelper.parseMinimumAge(null)).toBe(18);
      expect(MessagingSafetyHelper.parseMinimumAge("")).toBe(18);
      expect(MessagingSafetyHelper.parseMinimumAge("  ")).toBe(18);
      expect(MessagingSafetyHelper.parseMinimumAge("garbage")).toBe(18);
    });

    it("parses configured values", () => {
      expect(MessagingSafetyHelper.parseMinimumAge("0")).toBe(0);
      expect(MessagingSafetyHelper.parseMinimumAge("13")).toBe(13);
      expect(MessagingSafetyHelper.parseMinimumAge("18")).toBe(18);
    });

    it("clamps negatives to 0", () => {
      expect(MessagingSafetyHelper.parseMinimumAge("-5")).toBe(0);
    });
  });

  describe("isRestricted", () => {
    it("never restricts when disabled or person unknown", () => {
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(5) }, 0)).toBe(false);
      expect(MessagingSafetyHelper.isRestricted(null, 18)).toBe(false);
    });

    it("restricts by age from birthDate", () => {
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(12) }, 13)).toBe(true);
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(17) }, 18)).toBe(true);
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(30) }, 18)).toBe(false);
    });

    it("allows at exactly the minimum age", () => {
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(13, -1) }, 13)).toBe(false);
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(18, -1) }, 18)).toBe(false);
    });

    it("falls back to householdRole when birthDate is missing", () => {
      expect(MessagingSafetyHelper.isRestricted({ householdRole: "Child" }, 18)).toBe(true);
      expect(MessagingSafetyHelper.isRestricted({ householdRole: "child" }, 18)).toBe(true);
      expect(MessagingSafetyHelper.isRestricted({ householdRole: "CHILD" }, 18)).toBe(true);
      expect(MessagingSafetyHelper.isRestricted({ householdRole: "Head" }, 18)).toBe(false);
      expect(MessagingSafetyHelper.isRestricted({}, 18)).toBe(false);
    });

    it("prefers a valid birthDate over householdRole", () => {
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(25), householdRole: "Child" }, 18)).toBe(false);
    });

    it("falls back to householdRole on an invalid birthDate", () => {
      expect(MessagingSafetyHelper.isRestricted({ birthDate: new Date("garbage"), householdRole: "Child" }, 18)).toBe(true);
      expect(MessagingSafetyHelper.isRestricted({ birthDate: new Date("garbage") }, 18)).toBe(false);
    });
  });

  describe("disablePrivateMessages", () => {
    it("restricts a flagged person regardless of age", () => {
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(40), disablePrivateMessages: true }, 18)).toBe(true);
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(40), disablePrivateMessages: 1 }, 18)).toBe(true);
    });

    it("restricts a flagged person even when the age rule is off", () => {
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(40), disablePrivateMessages: true }, 0)).toBe(true);
    });

    it("does not restrict an unflagged adult", () => {
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(40), disablePrivateMessages: false }, 18)).toBe(false);
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(40), disablePrivateMessages: 0 }, 18)).toBe(false);
      expect(MessagingSafetyHelper.isRestricted({ birthDate: yearsAgo(40), disablePrivateMessages: null }, 18)).toBe(false);
    });
  });

  describe("restrictionReason", () => {
    it("names the flag before the age rule", () => {
      expect(MessagingSafetyHelper.restrictionReason({ birthDate: yearsAgo(10), disablePrivateMessages: true }, 18)).toBe("messagingDisabled");
      expect(MessagingSafetyHelper.restrictionReason({ birthDate: yearsAgo(10) }, 18)).toBe("ageRestricted");
      expect(MessagingSafetyHelper.restrictionReason({ birthDate: yearsAgo(40) }, 18)).toBeNull();
      expect(MessagingSafetyHelper.restrictionReason(null, 18)).toBeNull();
    });
  });
});
