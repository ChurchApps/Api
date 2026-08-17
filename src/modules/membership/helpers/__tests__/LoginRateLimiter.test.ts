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
const IP_KEY = "ip|1.1.1.1";

describe("LoginRateLimiter.allow", () => {
  it("allows an attempt while both buckets are under their limits", async () => {
    const { repos } = fakeRepos({ [ACCOUNT_KEY]: LoginRateLimiter.maxPerAccount - 1, [IP_KEY]: LoginRateLimiter.maxPerIp - 1 });
    expect(await LoginRateLimiter.allow(repos, "1.1.1.1", "a@b.c")).toBe(true);
  });

  it("blocks once the account bucket hits its limit", async () => {
    const { repos } = fakeRepos({ [ACCOUNT_KEY]: LoginRateLimiter.maxPerAccount });
    expect(await LoginRateLimiter.allow(repos, "1.1.1.1", "a@b.c")).toBe(false);
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
});

describe("LoginRateLimiter counters", () => {
  it("records a failure against both buckets", async () => {
    const { repos, incremented } = fakeRepos();
    await LoginRateLimiter.recordFailure(repos, "1.1.1.1", "a@b.c");
    expect(incremented).toEqual([ACCOUNT_KEY, IP_KEY]);
  });

  it("clears the account bucket on success but leaves the ip bucket standing", async () => {
    const { repos, cleared } = fakeRepos();
    await LoginRateLimiter.clearFailures(repos, "a@b.c");
    expect(cleared).toEqual([[ACCOUNT_KEY]]);
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
