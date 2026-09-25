import { LoginRateLimiter } from "../LoginRateLimiter.js";

function fakeRepos(counts: Record<string, number> = {}) {
  const incremented: string[] = [];
  const cleared: string[][] = [];
  const repos: any = {
    loginAttempt: {
      loadCount: jest.fn(async (key: string) => counts[key] ?? 0),
      increment: jest.fn(async (key: string) => { incremented.push(key); }),
      clear: jest.fn(async (keys: string[]) => { cleared.push(keys); })
    }
  };
  return { repos, incremented, cleared };
}

const ACCOUNT_KEY = "account|a@b.c";
const ACCOUNT_IP_KEY = "acctip|a@b.c|1.1.1.1";
const IP_KEY = "ip|1.1.1.1";

describe("LoginRateLimiter.allow", () => {
  it("allows an attempt while both buckets are under their limits", async () => {
    const { repos } = fakeRepos({ [ACCOUNT_KEY]: LoginRateLimiter.maxPerAccount - 1, [IP_KEY]: LoginRateLimiter.maxPerIp - 1 });
    expect(await LoginRateLimiter.allow(repos, "1.1.1.1", "a@b.c")).toBe(true);
  });

  it("blocks once the account+ip bucket hits its limit", async () => {
    const { repos } = fakeRepos({ [ACCOUNT_IP_KEY]: LoginRateLimiter.maxPerAccountIp });
    expect(await LoginRateLimiter.allow(repos, "1.1.1.1", "a@b.c")).toBe(false);
  });

  it("does not lock the account out for a different ip when one attacker ip exhausts its account bucket", async () => {
    const { repos } = fakeRepos({ [ACCOUNT_IP_KEY]: LoginRateLimiter.maxPerAccountIp, [ACCOUNT_KEY]: LoginRateLimiter.maxPerAccountIp });
    expect(await LoginRateLimiter.allow(repos, "2.2.2.2", "a@b.c")).toBe(true);
  });

  it("still blocks a distributed run once the looser pure-account ceiling is hit", async () => {
    const { repos } = fakeRepos({ [ACCOUNT_KEY]: LoginRateLimiter.maxPerAccount });
    expect(await LoginRateLimiter.allow(repos, "2.2.2.2", "a@b.c")).toBe(false);
  });

  it("applies a stricter account ceiling when asked (reset codes)", async () => {
    const { repos } = fakeRepos({ "account|verify:a@b.c": LoginRateLimiter.maxPerAccountStrict });
    expect(await LoginRateLimiter.allow(repos, "2.2.2.2", "verify:a@b.c")).toBe(true);
    expect(await LoginRateLimiter.allow(repos, "2.2.2.2", "verify:a@b.c", LoginRateLimiter.maxPerAccountStrict)).toBe(false);
  });

  it("treats an empty ip as its own bucket, not loopback", async () => {
    const { repos } = fakeRepos({ "ip|unknown": LoginRateLimiter.maxPerIp });
    expect(await LoginRateLimiter.allow(repos, "", "someone@b.c")).toBe(false);
  });

  it("blocks a spray across accounts once the ip bucket hits its limit", async () => {
    const { repos } = fakeRepos({ [IP_KEY]: LoginRateLimiter.maxPerIp });
    expect(await LoginRateLimiter.allow(repos, "1.1.1.1", "someone-else@b.c")).toBe(false);
  });

  it("checks only the ip bucket when no account can be named", async () => {
    const { repos } = fakeRepos();
    expect(await LoginRateLimiter.allow(repos, "1.1.1.1", "")).toBe(true);
    expect(repos.loginAttempt.loadCount).toHaveBeenCalledTimes(1);
    expect(repos.loginAttempt.loadCount).toHaveBeenCalledWith(IP_KEY, LoginRateLimiter.windowSeconds);
  });

  it("fails open when the counter store is unavailable", async () => {
    const { repos } = fakeRepos();
    repos.loginAttempt.loadCount.mockRejectedValue(new Error("db down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await LoginRateLimiter.allow(repos, "1.1.1.1", "a@b.c")).toBe(true);
    (console.error as jest.Mock).mockRestore();
  });

  it("does not apply the ip bucket on loopback (local demo / Playwright)", async () => {
    const { repos } = fakeRepos({ "ip|127.0.0.1": LoginRateLimiter.maxPerIp });
    expect(await LoginRateLimiter.allow(repos, "127.0.0.1", "a@b.c")).toBe(true);
    expect(repos.loginAttempt.loadCount).not.toHaveBeenCalledWith("ip|127.0.0.1", LoginRateLimiter.windowSeconds);
  });
});

describe("LoginRateLimiter counters", () => {
  it("records a failure against every bucket", async () => {
    const { repos, incremented } = fakeRepos();
    await LoginRateLimiter.recordFailure(repos, "1.1.1.1", "a@b.c");
    expect(incremented).toEqual([ACCOUNT_IP_KEY, ACCOUNT_KEY, IP_KEY]);
  });

  it("records a loopback failure against the account buckets only", async () => {
    const { repos, incremented } = fakeRepos();
    await LoginRateLimiter.recordFailure(repos, "127.0.0.1", "a@b.c");
    expect(incremented).toEqual(["acctip|a@b.c|127.0.0.1", ACCOUNT_KEY]);
  });

  it("clears the account buckets on success but leaves the ip bucket standing", async () => {
    const { repos, cleared } = fakeRepos();
    await LoginRateLimiter.clearFailures(repos, "a@b.c", "1.1.1.1");
    expect(cleared).toEqual([[ACCOUNT_IP_KEY, ACCOUNT_KEY]]);
  });

  it("swallows counter-store errors instead of failing the request", async () => {
    const { repos } = fakeRepos();
    repos.loginAttempt.increment.mockRejectedValue(new Error("db down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(LoginRateLimiter.recordFailure(repos, "1.1.1.1", "a@b.c")).resolves.toBeUndefined();
    (console.error as jest.Mock).mockRestore();
  });
});

describe("LoginRateLimiter.getClientIp", () => {
  it("prefers the API Gateway source ip over any header", () => {
    const req: any = {
      headers: { "x-forwarded-for": "9.9.9.9" },
      apiGateway: { event: { requestContext: { identity: { sourceIp: "5.5.5.5" } } } }
    };
    expect(LoginRateLimiter.getClientIp(req)).toBe("5.5.5.5");
  });

  it("reads the http api source ip shape too", () => {
    const req: any = { headers: {}, requestContext: { http: { sourceIp: "5.5.5.5" } } };
    expect(LoginRateLimiter.getClientIp(req)).toBe("5.5.5.5");
  });

  it("uses the last x-forwarded-for hop, so a spoofed header cannot reset the counter", () => {
    const req: any = { headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.7" } };
    expect(LoginRateLimiter.getClientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to the socket address when there is no proxy header", () => {
    const req: any = { headers: {}, socket: { remoteAddress: "127.0.0.1" } };
    expect(LoginRateLimiter.getClientIp(req)).toBe("127.0.0.1");
  });
});
