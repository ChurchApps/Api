import "reflect-metadata";
jest.mock("../DoingBaseController.js", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index.js", () => ({ PlanAuth: { canEditPosition: async () => true } }));
const publish = jest.fn();
jest.mock("../../../../shared/events/InternalEventBus.js", () => ({ InternalEventBus: { publish: (...args: any[]) => publish(...args) } }));
jest.mock("../../helpers/PlanHelper.js", () => ({ PlanHelper: { autoReplaceDeclined: jest.fn(), notifyLeadersOfResponse: jest.fn() } }));
jest.mock("../../helpers/SignupDeadlineHelper.js", () => ({ SignupDeadlineHelper: {} }));
const verify = jest.fn();
jest.mock("../../helpers/ReminderTokenHelper.js", () => ({ ReminderTokenHelper: { verify: (...args: any[]) => verify(...args) } }));
import { AssignmentController } from "../AssignmentController.js";

function fixture() {
  const assignment = { id: "a1", churchId: "c1", personId: "p1", positionId: "pos1", status: "Unconfirmed" };
  const plan = { id: "plan1", churchId: "c1", serviceDate: new Date(2030, 3, 7), prepared: false };
  const repos = { assignment: { load: jest.fn(async () => assignment), save: jest.fn(async (a: any) => a), delete: jest.fn() }, position: { load: async () => ({ id: "pos1", planId: "plan1" }) }, plan: { load: async () => plan } };
  const controller = new AssignmentController();
  (controller as any).repos = repos;
  (controller as any).getRepos = async () => repos;
  (controller as any).actionWrapper = (_r: any, _s: any, action: any) => action({ churchId: "c1", personId: "p1" });
  const response: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
  return { controller, repos, assignment, plan, response };
}
beforeEach(() => { jest.clearAllMocks(); verify.mockReturnValue({ assignmentId: "a1", churchId: "c1", action: "accept", request: { personId: "p1", positionId: "pos1", planId: "plan1", serviceDate: "2030-04-07" } }); });
it.each(["accept", "decline"])("publishes the signed-in %s response for the exact assignment", async (action) => {
  const f = fixture(); await (f.controller as any)[action]("a1", {}, {});
  expect(publish).toHaveBeenCalledWith("c1", "assignment.updated", expect.objectContaining({ id: "a1", status: action === "accept" ? "Accepted" : "Declined" }));
});
it("publishes a signed public reply but does not mutate on a link scanner GET", async () => {
  const f = fixture(); await f.controller.respondConfirm({ query: { token: "synthetic" } } as any, f.response);
  expect(f.repos.assignment.save).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
  await f.controller.respondSubmit({ query: { token: "synthetic" } } as any, f.response);
  expect(publish).toHaveBeenCalledWith("c1", "assignment.updated", expect.objectContaining({ id: "a1", status: "Accepted" }));
});
it.each(["person", "date", "draft"])("rejects a stale signed confirmation link after a %s change", async (kind) => {
  const f = fixture(); if (kind === "person") f.assignment.personId = "p2"; if (kind === "date") f.plan.serviceDate = new Date(2030, 3, 14); if (kind === "draft") f.plan.prepared = true;
  await f.controller.respondSubmit({ query: { token: "synthetic" } } as any, f.response);
  expect(f.response.status).toHaveBeenCalledWith(400); expect(f.repos.assignment.save).not.toHaveBeenCalled();
});
it("publishes administrative status changes and removals in the authenticated church", async () => {
  const f = fixture(); await f.controller.save({ body: [{ ...f.assignment, churchId: "forged", status: "Declined" }] } as any, f.response);
  expect(publish).toHaveBeenCalledWith("c1", "assignment.updated", expect.objectContaining({ churchId: "c1", status: "Declined" }));
  await f.controller.delete("a1", {} as any, f.response); expect(publish).toHaveBeenCalledWith("c1", "assignment.destroyed", { id: "a1" });
});
