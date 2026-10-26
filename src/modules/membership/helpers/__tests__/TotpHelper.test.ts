import { TotpHelper } from "../TotpHelper.js";

// RFC 6238 Appendix B vectors (SHA1 seed "12345678901234567890"), truncated to 6 digits.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TotpHelper", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(TotpHelper.codeAt(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(TotpHelper.codeAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(TotpHelper.codeAt(RFC_SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("accepts one step of drift and nothing further", () => {
    const now = 1111111109 * 1000;
    const step = TotpHelper.currentStep(now);
    expect(TotpHelper.matchStep(RFC_SECRET, TotpHelper.codeAt(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(TotpHelper.matchStep(RFC_SECRET, TotpHelper.codeAt(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(TotpHelper.matchStep(RFC_SECRET, TotpHelper.codeAt(RFC_SECRET, step - 2), now)).toBeNull();
    expect(TotpHelper.matchStep(RFC_SECRET, "abc123", now)).toBeNull();
  });

  it("generates 32-char base32 secrets that round-trip", () => {
    const secret = TotpHelper.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const code = TotpHelper.codeAt(secret, TotpHelper.currentStep());
    expect(TotpHelper.matchStep(secret, code)).not.toBeNull();
  });
});
