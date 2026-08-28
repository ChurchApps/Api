import { AuthGuidHelper } from "../AuthGuidHelper.js";

describe("AuthGuidHelper", () => {
  it("mints a raw uuid and a hashed stored value with TTL", () => {
    const before = Date.now();
    const { raw, stored } = AuthGuidHelper.mint();
    const parsed = AuthGuidHelper.parse(stored);
    expect(raw).toMatch(/^[0-9a-f-]{36}$/i);
    expect(stored).not.toContain(raw);
    expect(parsed?.hash).toBe(AuthGuidHelper.hash(raw));
    expect(parsed?.loginUsed).toBe(false);
    expect(parsed?.expires).toBeGreaterThanOrEqual(before + AuthGuidHelper.ttlMs);
    expect(parsed?.expires).toBeLessThanOrEqual(Date.now() + AuthGuidHelper.ttlMs);
  });

  it("allows one login then rejects reuse while set-password still works", () => {
    const { raw, stored } = AuthGuidHelper.mint();
    expect(AuthGuidHelper.canLogin(stored)).toBe(true);
    expect(AuthGuidHelper.canSetPassword(stored)).toBe(true);

    const used = AuthGuidHelper.markLoginUsed(stored, raw);
    expect(AuthGuidHelper.canLogin(used)).toBe(false);
    expect(AuthGuidHelper.canSetPassword(used)).toBe(true);
    expect(AuthGuidHelper.parse(used)?.hash).toBe(AuthGuidHelper.hash(raw));
  });

  it("rejects expired tokens for login and set-password", () => {
    const { raw } = AuthGuidHelper.mint();
    const expired = `${AuthGuidHelper.hash(raw)}:${Date.now() - 1}`;
    expect(AuthGuidHelper.canLogin(expired)).toBe(false);
    expect(AuthGuidHelper.canSetPassword(expired)).toBe(false);
  });

  it("treats empty as unusable and legacy plaintext as one-time login", () => {
    expect(AuthGuidHelper.canLogin("")).toBe(false);
    expect(AuthGuidHelper.canSetPassword("")).toBe(false);
    expect(AuthGuidHelper.canLogin(undefined)).toBe(false);

    const legacy = "11111111-1111-4111-8111-111111111111";
    expect(AuthGuidHelper.parse(legacy)).toBeNull();
    expect(AuthGuidHelper.canLogin(legacy)).toBe(true);
    const used = AuthGuidHelper.markLoginUsed(legacy, legacy);
    expect(AuthGuidHelper.canLogin(used)).toBe(false);
    expect(AuthGuidHelper.canSetPassword(used)).toBe(true);
  });
});

test("invite guid never expires", () => {
  const { stored } = AuthGuidHelper.mint(true);
  expect(AuthGuidHelper.isExpired(stored)).toBe(false);
  expect(AuthGuidHelper.canSetPassword(stored)).toBe(true);
});
