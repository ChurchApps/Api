const counts: Record<string, number> = {};
const loginAttempt = {
  loadCount: jest.fn(async (key: string) => counts[key] || 0),
  increment: jest.fn(async (key: string) => { counts[key] = (counts[key] || 0) + 1; })
};
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: async () => ({ loginAttempt }) } }));

import { DonationRateLimiter } from "../DonationRateLimiter";

const req = (xff: string, sourceIp?: string): any => ({ headers: { "x-forwarded-for": xff }, requestContext: sourceIp ? { identity: { sourceIp } } : undefined });

beforeEach(() => {
  Object.keys(counts).forEach((k) => delete counts[k]);
  jest.clearAllMocks();
});

describe("DonationRateLimiter", () => {
  it("keys on the API Gateway source IP, not a spoofable first X-Forwarded-For hop", () => {
    expect(DonationRateLimiter.getClientIp(req("6.6.6.6, 1.2.3.4"))).toBe("1.2.3.4");
    expect(DonationRateLimiter.getClientIp(req("6.6.6.6", "9.9.9.9"))).toBe("9.9.9.9");
  });

  it("blocks an IP after the hourly limit", async () => {
    for (let i = 0; i < DonationRateLimiter.maxPerIp; i++) expect(await DonationRateLimiter.allow(req("1.2.3.4"), "CHU1")).toBe(true);
    expect(await DonationRateLimiter.allow(req("1.2.3.4"), "CHU1")).toBe(false);
    expect(await DonationRateLimiter.allow(req("5.6.7.8"), "CHU2")).toBe(true);
  });

  it("blocks an IP that keeps getting declined", async () => {
    for (let i = 0; i < DonationRateLimiter.maxDeclinesPerIp; i++) await DonationRateLimiter.recordDecline(req("1.2.3.4"));
    expect(await DonationRateLimiter.allow(req("1.2.3.4"), "CHU1")).toBe(false);
  });

  it("caps anonymous attempts per church across IPs", async () => {
    counts["give|church|CHU1"] = DonationRateLimiter.maxPerChurch;
    expect(await DonationRateLimiter.allow(req("1.2.3.4"), "CHU1")).toBe(false);
  });

  it("fails open when the counter store is down", async () => {
    loginAttempt.loadCount.mockRejectedValueOnce(new Error("db down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await DonationRateLimiter.allow(req("1.2.3.4"), "CHU1")).toBe(true);
  });
});
