import "reflect-metadata";
jest.mock("../DoingBaseController.js", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index.js", () => ({ PlanAuth: { canEditPosition: async () => true } }));
const publish = jest.fn();
jest.mock("../../../../shared/events/InternalEventBus.js", () => ({ InternalEventBus: { publish: (...args: unknown[]) => publish(...args) } }));
jest.mock("../../helpers/PlanHelper.js", () => ({ PlanHelper: { autoReplaceDeclined: jest.fn(), notifyLeadersOfResponse: jest.fn() } }));
jest.mock("../../helpers/SignupDeadlineHelper.js", () => ({ SignupDeadlineHelper: {} }));
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
