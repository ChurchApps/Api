const counts = new Map<string, number>();
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({
  RepoManager: {
    getRepos: async () => ({
      loginAttempt: {
        loadCount: async (key: string) => counts.get(key) || 0,
        increment: async (key: string) => { counts.set(key, (counts.get(key) || 0) + 1); }
      }
    })
  }
}));

import { DevicePairRateLimiter } from "../DevicePairRateLimiter.js";

describe("DevicePairRateLimiter", () => {
  beforeEach(() => counts.clear());

  it("stops a user after maxPerUser attempts", async () => {
    for (let i = 0; i < DevicePairRateLimiter.maxPerUser; i++) expect(await DevicePairRateLimiter.consume("u1", "c1")).toBe(true);
    expect(await DevicePairRateLimiter.consume("u1", "c1")).toBe(false);
  });

  it("stops a church after maxPerChurch attempts across its users", async () => {
    for (let i = 0; i < DevicePairRateLimiter.maxPerChurch; i++) expect(await DevicePairRateLimiter.consume("u" + (i % 3), "c1")).toBe(true);
    expect(await DevicePairRateLimiter.consume("uNew", "c1")).toBe(false);
    expect(await DevicePairRateLimiter.consume("uNew", "c2")).toBe(true);
  });
});
