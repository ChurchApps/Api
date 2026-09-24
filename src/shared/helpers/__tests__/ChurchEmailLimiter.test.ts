jest.mock("../../infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn() } }));

import { RepoManager } from "../../infrastructure/RepoManager.js";
import { ChurchEmailLimiter } from "../ChurchEmailLimiter.js";

const DAY = 24 * 60 * 60 * 1000;

function setup(church: any, sentByChurch: number, poolSent = 0) {
  const repos: any = {
    church: { loadById: jest.fn(async () => church), loadIdsRegisteredSince: jest.fn(async () => ["c1", "c2"]) },
    deliveryLog: { countEmailsSince: jest.fn(async (ids: string[]) => (ids.length === 1 ? sentByChurch : poolSent)) }
  };
  (RepoManager.getRepos as jest.Mock).mockResolvedValue(repos);
}

describe("ChurchEmailLimiter.remaining", () => {
  it("blocks archived and missing churches", async () => {
    setup({ id: "c1", archivedDate: new Date(), registrationDate: new Date(0) }, 0);
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(0);
    setup(null, 0);
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(0);
  });

  it("gives established churches the full daily cap", async () => {
    setup({ id: "c1", registrationDate: new Date(Date.now() - 60 * DAY) }, 500);
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(1500);
  });

  it("caps new churches per church and by the shared new-church pool", async () => {
    setup({ id: "c1", registrationDate: new Date() }, 10, 20);
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(40);
    setup({ id: "c1", registrationDate: new Date() }, 0, 290);
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(10);
    setup({ id: "c1", registrationDate: new Date() }, 0, 400);
    expect(await ChurchEmailLimiter.remaining("c1")).toBe(0);
  });
});
