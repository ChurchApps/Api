import "reflect-metadata";

// The giving gateway reads its own database; stub it with donors keyed by church so the test needs no DB.
const donorsByChurch: Record<string, string[]> = {};
const loadDonorPersonIds = jest.fn(async (churchId: string, _fundId: string | null, _start: Date, _end: Date): Promise<string[]> => donorsByChurch[churchId] || []);
jest.mock("../../../../shared/modules/index", () => ({
  getAttendanceModuleGateway: () => ({ loadAttendeePersonIds: async (): Promise<string[]> => [] }),
  getGivingModuleGateway: () => ({ loadDonorPersonIds })
}));
jest.mock("../PersonConditionHelper", () => ({ PersonConditionHelper: { applyOne: jest.fn((data: unknown[]) => data), usesThisMonth: () => false } }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "generated" } }));

import { ListRuleHelper } from "../ListRuleHelper";
import type { ListRuleCondition } from "../../models/index.js";
import type { Repos } from "../../repositories/index.js";

const peopleByChurch: Record<string, { id: string }[]> = {
  ch1: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
  ch2: [{ id: "q1" }, { id: "q2" }]
};

const repos = Object.assign({} as Repos, { person: { loadAll: jest.fn(async (churchId: string) => peopleByChurch[churchId] || []) } });

const evalGiving = (churchId: string, condition: Partial<ListRuleCondition>) =>
  ListRuleHelper.evaluate(churchId, { match: "all", conditions: [{ provider: "giving", field: "donated", from: "2026-01-01", to: "2026-03-31", ...condition }] }, undefined, repos);

describe("giving list rule: has not donated", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    donorsByChurch.ch1 = ["p2"];
    donorsByChurch.ch2 = ["q1"];
  });

  it("excludes people who gave in the range and keeps everyone who did not", async () => {
    const ids = await evalGiving("ch1", { operator: "notIn" });
    expect(ids.sort()).toEqual(["p1", "p3"]);
    const [, fundId, start, end] = loadDonorPersonIds.mock.calls[0];
    expect(fundId).toBeNull();
    expect(start).toEqual(new Date("2026-01-01"));
    expect(end).toEqual(new Date("2026-03-31"));
  });

  it("passes the chosen fund to the donor lookup", async () => {
    await evalGiving("ch1", { operator: "notIn", entityId: "fund1" });
    expect(loadDonorPersonIds.mock.calls[0][1]).toBe("fund1");
  });

  it("returns everyone when nobody gave in the range", async () => {
    donorsByChurch.ch1 = [];
    expect((await evalGiving("ch1", { operator: "notIn" })).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("stays inside the caller's church for both the donors and the people", async () => {
    // A ch1 person id showing up as a ch2 donor must not leak into ch2's result, and vice versa.
    donorsByChurch.ch2 = ["q1", "p1"];
    const ids = await evalGiving("ch2", { operator: "notIn" });
    expect(ids).toEqual(["q2"]);
    expect(loadDonorPersonIds.mock.calls.every((call) => call[0] === "ch2")).toBe(true);
    expect((repos.person.loadAll as jest.Mock).mock.calls.every((call) => call[0] === "ch2")).toBe(true);
  });

  it("keeps the existing has-donated rule returning the donors", async () => {
    expect(await evalGiving("ch1", {})).toEqual(["p2"]);
  });
});
