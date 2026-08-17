import { PublicPersonRateLimiter } from "../PublicPersonRateLimiter.js";

describe("PublicPersonRateLimiter", () => {
  beforeEach(() => PublicPersonRateLimiter.reset());

  it("allows up to maxHits in the window", () => {
    for (let i = 0; i < PublicPersonRateLimiter.maxHits; i++) {
      expect(PublicPersonRateLimiter.allow("1.1.1.1", "c1", "guest-register")).toBe(true);
    }
    expect(PublicPersonRateLimiter.allow("1.1.1.1", "c1", "guest-register")).toBe(false);
  });

  it("isolates buckets and churches", () => {
    for (let i = 0; i < PublicPersonRateLimiter.maxHits; i++) PublicPersonRateLimiter.allow("1.1.1.1", "c1", "guest-register");
    expect(PublicPersonRateLimiter.allow("1.1.1.1", "c1", "loadOrCreate")).toBe(true);
    expect(PublicPersonRateLimiter.allow("1.1.1.1", "c2", "guest-register")).toBe(true);
  });
});
