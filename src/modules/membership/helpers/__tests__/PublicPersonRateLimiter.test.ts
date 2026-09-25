import { PublicPersonRateLimiter } from "../PublicPersonRateLimiter.js";

function fakeRepos() {
  const counts: Record<string, number> = {};
  const repos: any = {
    loginAttempt: {
      loadCount: jest.fn(async (key: string) => counts[key] ?? 0),
      increment: jest.fn(async (key: string) => { counts[key] = (counts[key] ?? 0) + 1; })
    }
  };
  return { repos, counts };
}

describe("PublicPersonRateLimiter", () => {
  it("allows up to maxHits in the window", async () => {
    const { repos } = fakeRepos();
    for (let i = 0; i < PublicPersonRateLimiter.maxHits; i++) {
      expect(await PublicPersonRateLimiter.allow(repos, "1.1.1.1", "c1", "guest-register")).toBe(true);
    }
    expect(await PublicPersonRateLimiter.allow(repos, "1.1.1.1", "c1", "guest-register")).toBe(false);
  });

  it("isolates buckets and churches", async () => {
    const { repos } = fakeRepos();
    for (let i = 0; i < PublicPersonRateLimiter.maxHits; i++) await PublicPersonRateLimiter.allow(repos, "1.1.1.1", "c1", "guest-register");
    expect(await PublicPersonRateLimiter.allow(repos, "1.1.1.1", "c1", "loadOrCreate")).toBe(true);
    expect(await PublicPersonRateLimiter.allow(repos, "1.1.1.1", "c2", "guest-register")).toBe(true);
  });

  it("honours a custom ceiling and window", async () => {
    const { repos } = fakeRepos();
    expect(await PublicPersonRateLimiter.allow(repos, "1.1.1.1", "", "register", 1, 3600)).toBe(true);
    expect(await PublicPersonRateLimiter.allow(repos, "1.1.1.1", "", "register", 1, 3600)).toBe(false);
    expect(repos.loginAttempt.loadCount).toHaveBeenCalledWith("pp|register||1.1.1.1", 3600);
  });

  it("does not throttle loopback (local demo / Playwright)", async () => {
    const { repos } = fakeRepos();
    for (let i = 0; i < PublicPersonRateLimiter.maxHits + 5; i++) {
      expect(await PublicPersonRateLimiter.allow(repos, "127.0.0.1", "c1", "guest-register")).toBe(true);
      expect(await PublicPersonRateLimiter.allow(repos, "::ffff:127.0.0.1", "c1", "loadOrCreate")).toBe(true);
      expect(await PublicPersonRateLimiter.allow(repos, "127.0.0.2", "c1", "guest-register")).toBe(true);
    }
    expect(repos.loginAttempt.loadCount).not.toHaveBeenCalled();
  });

  it("throttles an empty ip instead of treating it as loopback", async () => {
    const { repos } = fakeRepos();
    for (let i = 0; i < PublicPersonRateLimiter.maxHits; i++) await PublicPersonRateLimiter.allow(repos, "", "c1", "loadOrCreate");
    expect(await PublicPersonRateLimiter.allow(repos, "", "c1", "loadOrCreate")).toBe(false);
  });

  it("fails open when the counter store is unavailable", async () => {
    const { repos } = fakeRepos();
    repos.loginAttempt.loadCount.mockRejectedValue(new Error("db down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await PublicPersonRateLimiter.allow(repos, "1.1.1.1", "c1", "guest-register")).toBe(true);
    (console.error as jest.Mock).mockRestore();
  });
});
