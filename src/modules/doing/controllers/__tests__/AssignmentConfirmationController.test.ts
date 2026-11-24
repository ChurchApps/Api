import "reflect-metadata";
jest.mock("../DoingBaseController.js", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index.js", () => ({ PlanAuth: { canEditPosition: async () => true }, Permissions: { plans: { edit: { contentType: "Plans", action: "Edit" } } } }));
const publish = jest.fn();
jest.mock("../../../../shared/events/InternalEventBus.js", () => ({ InternalEventBus: { publish: (...args: unknown[]) => publish(...args) } }));
jest.mock("../../helpers/PlanHelper.js", () => ({ PlanHelper: { autoReplaceDeclined: jest.fn(), notifyLeadersOfResponse: jest.fn() } }));
jest.mock("../../helpers/SignupDeadlineHelper.js", () => ({ SignupDeadlineHelper: {} }));
jest.mock("../../helpers/ServingFeedHelper.js", () => ({ ServingFeedHelper: {} }));
const verify = jest.fn();
jest.mock("../../helpers/ReminderTokenHelper.js", () => ({ ReminderTokenHelper: { verify: (...args: unknown[]) => verify(...args) } }));
import express from "express";
import { AuthenticatedUser } from "@churchapps/apihelper";
import { Repos } from "../../repositories/index.js";
import { Assignment } from "../../models/index.js";
import { AssignmentController } from "../AssignmentController.js";

const req = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

function fixture() {
  const assignment = { id: "a1", churchId: "c1", personId: "p1", positionId: "pos1", status: "Unconfirmed" };
  const plan = { id: "plan1", churchId: "c1", serviceDate: new Date(2030, 3, 7), prepared: false };
  const repos = { assignment: { load: jest.fn(async () => assignment), save: jest.fn(async (a: Assignment) => a), delete: jest.fn() }, position: { load: async () => ({ id: "pos1", planId: "plan1" }) }, plan: { load: async () => plan } };
  // respond() loads repos itself via the protected getRepos.
  class TestController extends AssignmentController {
    protected async getRepos<T>(): Promise<T> { return repos as T; }
  }
  const controller = new TestController();
  controller.repos = Object.assign({} as Repos, repos);
  controller.actionWrapper = async (_r, _s, action) => action({ churchId: "c1", personId: "p1" } as AuthenticatedUser);
  const response = Object.assign({} as express.Response, { status: jest.fn().mockReturnThis(), send: jest.fn() });
  return { controller, repos, assignment, plan, response };
}
beforeEach(() => { jest.clearAllMocks(); verify.mockReturnValue({ assignmentId: "a1", churchId: "c1", action: "accept", request: { personId: "p1", positionId: "pos1", planId: "plan1", serviceDate: "2030-04-07" } }); });
it.each(["accept", "decline"] as const)("publishes the signed-in %s response for the exact assignment", async (action) => {
  const f = fixture(); await f.controller[action]("a1", req({}), res);
  expect(publish).toHaveBeenCalledWith("c1", "assignment.updated", expect.objectContaining({ id: "a1", status: action === "accept" ? "Accepted" : "Declined" }));
});
it("publishes a signed public reply but does not mutate on a link scanner GET", async () => {
  const f = fixture(); await f.controller.respondConfirm(req({ query: { token: "synthetic" } }), f.response);
  expect(f.repos.assignment.save).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
  await f.controller.respondSubmit(req({ query: { token: "synthetic" } }), f.response);
  expect(publish).toHaveBeenCalledWith("c1", "assignment.updated", expect.objectContaining({ id: "a1", status: "Accepted" }));
});
it.each(["person", "date", "draft"])("rejects a stale signed confirmation link after a %s change", async (kind) => {
  const f = fixture(); if (kind === "person") f.assignment.personId = "p2"; if (kind === "date") f.plan.serviceDate = new Date(2030, 3, 14); if (kind === "draft") f.plan.prepared = true;
  await f.controller.respondSubmit(req({ query: { token: "synthetic" } }), f.response);
  expect(f.response.status).toHaveBeenCalledWith(400); expect(f.repos.assignment.save).not.toHaveBeenCalled();
});
it("publishes administrative status changes and removals in the authenticated church", async () => {
  const f = fixture(); await f.controller.save(req({ body: [{ ...f.assignment, churchId: "forged", status: "Declined" }] }), f.response);
  expect(publish).toHaveBeenCalledWith("c1", "assignment.updated", expect.objectContaining({ churchId: "c1", status: "Declined" }));
  await f.controller.delete("a1", req({}), f.response); expect(publish).toHaveBeenCalledWith("c1", "assignment.destroyed", { id: "a1" });
});

describe("decline reason", () => {
  it("saves a trimmed, single-line reason capped at 255 characters", async () => {
    const f = fixture();
    await f.controller.decline("a1", req({ body: { declineReason: "  Out of town\r\nthat week " + "x".repeat(400) } }), res);
    const saved = f.repos.assignment.save.mock.calls[0][0] as Assignment;
    expect(saved.status).toBe("Declined");
    expect(saved.declineReason).toMatch(/^Out of town that week x+$/);
    expect(saved.declineReason.length).toBe(255);
  });

  it("stores no reason when the volunteer leaves it blank", async () => {
    const f = fixture();
    await f.controller.decline("a1", req({ body: { declineReason: "   " } }), res);
    expect((f.repos.assignment.save.mock.calls[0][0] as Assignment).declineReason).toBeNull();
  });

  it("offers a reason field on the emailed decline page and saves it on submit", async () => {
    verify.mockReturnValue({ assignmentId: "a1", churchId: "c1", action: "decline", request: { personId: "p1", positionId: "pos1", planId: "plan1", serviceDate: "2030-04-07" } });
    const f = fixture();
    await f.controller.respondConfirm(req({ query: { token: "synthetic" } }), f.response);
    expect((f.response.send as jest.Mock).mock.calls[0][0]).toContain('name="reason"');
    await f.controller.respondSubmit(req({ query: { token: "synthetic" }, body: { reason: " Sick " } }), f.response);
    expect(f.repos.assignment.save).toHaveBeenCalledWith(expect.objectContaining({ status: "Declined", declineReason: "Sick" }));
  });

  it("reads the reason from the raw urlencoded body Lambda leaves as a string", async () => {
    verify.mockReturnValue({ assignmentId: "a1", churchId: "c1", action: "decline", request: { personId: "p1", positionId: "pos1", planId: "plan1", serviceDate: "2030-04-07" } });
    const f = fixture();
    await f.controller.respondSubmit(req({ query: { token: "synthetic" }, body: "reason=Out+of+town%21" as unknown as Record<string, unknown> }), f.response);
    expect(f.repos.assignment.save).toHaveBeenCalledWith(expect.objectContaining({ status: "Declined", declineReason: "Out of town!" }));
  });

  it("does not offer a reason field on the accept page", async () => {
    const f = fixture();
    await f.controller.respondConfirm(req({ query: { token: "synthetic" } }), f.response);
    expect((f.response.send as jest.Mock).mock.calls[0][0]).not.toContain('name="reason"');
  });
});

describe("decline reason visibility", () => {
  const rows = [
    { id: "a1", personId: "p1", status: "Declined", declineReason: "Mine" },
    { id: "a2", personId: "p2", status: "Declined", declineReason: "Private to p2" }
  ];
  const asViewer = (f: ReturnType<typeof fixture>, canEditPlans: boolean) => {
    f.controller.actionWrapper = async (_r, _s, action) => action({ churchId: "c1", personId: "p1", checkAccess: () => canEditPlans } as unknown as AuthenticatedUser);
    (f.repos.assignment as Record<string, unknown>).loadByPlanId = jest.fn(async () => rows.map((r) => ({ ...r })));
  };

  it("hides other volunteers' reasons from a plan's assignment list for a member", async () => {
    const f = fixture(); asViewer(f, false);
    const result = await f.controller.getForPlan("plan1", req({}), res) as Assignment[];
    expect(result.find((a) => a.id === "a1")?.declineReason).toBe("Mine");
    expect(result.find((a) => a.id === "a2")?.declineReason).toBeNull();
  });

  it("shows every reason to a plan editor", async () => {
    const f = fixture(); asViewer(f, true);
    const result = await f.controller.getForPlan("plan1", req({}), res) as Assignment[];
    expect(result.find((a) => a.id === "a2")?.declineReason).toBe("Private to p2");
  });
});
