import "reflect-metadata";
jest.mock("../DoingBaseController.js", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index.js", () => ({ PlanAuth: { canEditPosition: async () => true } }));
jest.mock("../../../../shared/events/InternalEventBus.js", () => ({ InternalEventBus: { publish: jest.fn() } }));
jest.mock("../../helpers/PlanHelper.js", () => ({ PlanHelper: {} }));
jest.mock("../../helpers/SignupDeadlineHelper.js", () => ({ SignupDeadlineHelper: {} }));
jest.mock("../../helpers/ReminderTokenHelper.js", () => ({ ReminderTokenHelper: {} }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { jwtSecret: "synthetic-test-secret", b1AppRoot: "https://{subdomain}.b1.church" } }));
const settings = new Map<string, string>();
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({
    loadSetting: async (churchId: string, key: string) => settings.get(churchId + "|" + key) ?? null,
    saveSetting: async (churchId: string, key: string, value: string) => { settings.set(churchId + "|" + key, value); },
    loadChurch: async () => ({ id: "c1", name: "Grace", subDomain: "grace" })
  })
}));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));
import express from "express";
import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import { AuthenticatedUser } from "@churchapps/apihelper";
import { getDb } from "../../db/index.js";
import { Repos } from "../../repositories/index.js";
import { AssignmentRepo } from "../../repositories/AssignmentRepo.js";
import { ServingFeedTokenHelper } from "../../helpers/ServingFeedTokenHelper.js";
import { ServingFeedHelper } from "../../helpers/ServingFeedHelper.js";
import { AssignmentController } from "../AssignmentController.js";

const req = (r: Partial<express.Request>) => r as express.Request;
const rows = [
  { assignmentId: "a1", positionName: "Usher", categoryName: "Hospitality", planId: "plan1", planName: "Sunday AM", serviceDate: "2030-04-07" },
  { assignmentId: "a2", positionName: "Drums", categoryName: "Band", planId: "plan2", planName: "Easter", serviceDate: "2030-04-14" }
];
const times = [
  { id: "t1", planId: "plan1", displayName: "9am", startTime: new Date(Date.UTC(2030, 3, 7, 14)), endTime: new Date(Date.UTC(2030, 3, 7, 15, 30)), teams: "Hospitality,Band", serviceTimeType: "service" },
  { id: "t2", planId: "plan1", displayName: "Band rehearsal", startTime: new Date(Date.UTC(2030, 3, 7, 12)), teams: "Band", serviceTimeType: "rehearsal" }
];

function fixture() {
  const repos = { assignment: { loadAcceptedForFeed: jest.fn(async () => rows) }, time: { loadByPlanIds: jest.fn(async () => times) } };
  class TestController extends AssignmentController {
    protected async getRepos<T>(): Promise<T> { return repos as T; }
  }
  const controller = new TestController();
  controller.repos = Object.assign({} as Repos, repos);
  controller.actionWrapper = async (_r, _s, action) => action({ churchId: "c1", personId: "p1" } as AuthenticatedUser);
  const response = Object.assign({} as express.Response, { status: jest.fn().mockReturnThis(), send: jest.fn(), set: jest.fn() });
  return { controller, repos, response };
}

beforeEach(() => settings.clear());

describe("ServingFeedTokenHelper", () => {
  it("issues an opaque token that only verifies for the same church and person", async () => {
    const token = await ServingFeedTokenHelper.create("c1", "p1");
    expect(token).not.toContain("p1");
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(await ServingFeedTokenHelper.verify("c1", "p1", token)).toBe(true);
    expect(await ServingFeedTokenHelper.verify("c1", "p2", token)).toBe(false);
    expect(await ServingFeedTokenHelper.verify("c2", "p1", token)).toBe(false);
    expect(await ServingFeedTokenHelper.verify("c1", "p1", token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(await ServingFeedTokenHelper.verify("c1", "p1", ["x"])).toBe(false);
    expect(await ServingFeedTokenHelper.verify("c1", "p1", "p1")).toBe(false);
  });

  it("invalidates the old link on reset", async () => {
    const old = await ServingFeedTokenHelper.create("c1", "p1");
    const fresh = await ServingFeedTokenHelper.reset("c1", "p1");
    expect(fresh).not.toBe(old);
    expect(await ServingFeedTokenHelper.verify("c1", "p1", old)).toBe(false);
    expect(await ServingFeedTokenHelper.verify("c1", "p1", fresh)).toBe(true);
    expect(await ServingFeedTokenHelper.create("c1", "p1")).toBe(fresh);
  });
});

describe("serving calendar feed endpoint", () => {
  it("serves only the signed-in person's own accepted assignments for a valid link", async () => {
    const f = fixture();
    const link = await f.controller.getMyCalendar(req({}), f.response) as { churchId: string; personId: string; token: string };
    expect(link).toEqual({ churchId: "c1", personId: "p1", token: expect.any(String) });
    await f.controller.calendarFeed(req({ query: { churchId: "c1", personId: "p1", token: link.token } }), f.response);
    expect(f.repos.assignment.loadAcceptedForFeed).toHaveBeenCalledWith("c1", "p1");
    expect(f.response.set).toHaveBeenCalledWith("Content-Type", "text/calendar");
    const body = ((f.response.send as jest.Mock).mock.calls[0][0] as string).replace(/\r\n[ \t]/g, "");
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:Usher · Sunday AM");
    expect(body).toContain("SUMMARY:Drums · Easter");
    expect(body).toContain("https://grace.b1.church/mobile/plans/plan1");
    expect(body).toContain("X-WR-CALNAME:Serving at Grace");
  });

  it.each([
    ["tampered", (t: string) => t.slice(0, -2) + "zz", "p1"],
    ["someone else's", (t: string) => t, "p2"],
    ["missing", () => "", "p1"]
  ])("rejects a %s token with 401 before loading any assignments", async (_label, mutate, personId) => {
    const f = fixture();
    const token = await ServingFeedTokenHelper.create("c1", "p1");
    await f.controller.calendarFeed(req({ query: { churchId: "c1", personId, token: mutate(token) } }), f.response);
    expect(f.response.status).toHaveBeenCalledWith(401);
    expect(f.repos.assignment.loadAcceptedForFeed).not.toHaveBeenCalled();
  });

  it("stops serving the old link after Reset link", async () => {
    const f = fixture();
    const old = (await f.controller.getMyCalendar(req({}), f.response) as { token: string }).token;
    const fresh = (await f.controller.resetMyCalendar(req({}), f.response) as { token: string }).token;
    await f.controller.calendarFeed(req({ query: { churchId: "c1", personId: "p1", token: old } }), f.response);
    expect(f.response.status).toHaveBeenCalledWith(401);
    await f.controller.calendarFeed(req({ query: { churchId: "c1", personId: "p1", token: fresh } }), f.response);
    expect(f.repos.assignment.loadAcceptedForFeed).toHaveBeenCalledTimes(1);
  });
});

describe("AssignmentRepo.loadAcceptedForFeed", () => {
  it("selects only the person's accepted assignments on published plans in the church, without other people's data", async () => {
    const compiled: { sql: string; parameters: readonly unknown[] }[] = [];
    const db = new Kysely<Record<string, never>>({
      dialect: { createAdapter: () => new MysqlAdapter(), createDriver: () => new DummyDriver(), createIntrospector: (d) => new MysqlIntrospector(d), createQueryCompiler: () => new MysqlQueryCompiler() },
      log: (e) => { compiled.push(e.query); }
    });
    (getDb as jest.Mock).mockReturnValue(db);
    await new AssignmentRepo().loadAcceptedForFeed("c1", "p1");
    const { sql, parameters } = compiled[0];
    expect(sql).toMatch(/`a`\.`churchId` = \?/);
    expect(sql).toMatch(/`a`\.`personId` = \?/);
    expect(sql).toMatch(/`a`\.`status` = \?/);
    expect(sql).toMatch(/`pl`\.`prepared`/);
    expect(parameters).toEqual(expect.arrayContaining(["c1", "p1", "Accepted"]));
    expect(sql).not.toMatch(/personId`? as|displayName|notes/i);
  });
});

describe("ServingFeedHelper.buildEvents", () => {
  it("uses the team's service times and falls back to an all-day event", () => {
    const events = ServingFeedHelper.buildEvents(rows, times, (id) => "https://x.example/" + id);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ uid: "a1-t1@b1.church", start: times[0].startTime.getTime(), end: times[0].endTime.getTime(), title: "Usher · Sunday AM" });
    expect(events[1]).toMatchObject({ uid: "a2@b1.church", start: [2030, 4, 14], end: [2030, 4, 15], title: "Drums · Easter" });
  });
});
