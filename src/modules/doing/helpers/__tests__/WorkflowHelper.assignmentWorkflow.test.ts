import "reflect-metadata";

jest.mock("@churchapps/apihelper", () => ({ DateHelper: {} }));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: {} }));
jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: {} }));
jest.mock("../StepActionHelper.js", () => ({ StepActionHelper: {} }));
jest.mock("../AssignmentWorkflowHelper.js", () => ({ AssignmentWorkflowHelper: { workflowType: "assignmentConfirmation" } }));

import { WorkflowHelper } from "../WorkflowHelper.js";
import { statusFromError } from "../../../../shared/helpers/httpError.js";
import type { Repos } from "../../repositories/Repos.js";

// In-memory fakes return partial rows, so each repo method may resolve to a partial of what the real one returns.
type Loose<R> = R extends (infer E)[] ? Partial<E>[] : R extends object ? Partial<R> : R;
type FakeRepo<T> = { [K in keyof T]?: T[K] extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<Loose<R>> : T[K] };
type FakeRepos = { [K in keyof Repos]?: FakeRepo<Repos[K]> };

// Production: 5 "Issue serving requests from a plan to use this workflow" 500s on /doing/tasks/addToWorkflow and
// bulkAddToWorkflow. Asking to add people to a plan-driven workflow is a bad request, not a server failure.
describe("WorkflowHelper with an assignment confirmation workflow", () => {
  const fake: FakeRepos = { workflow: { load: jest.fn(async () => ({ id: "wf1", workflowType: "assignmentConfirmation" })) } };
  const repos = fake as Repos;

  it("answers 400 from addToWorkflow", async () => {
    const error = await WorkflowHelper.addToWorkflow("c1", "wf1", { type: "person", id: "p1" }, undefined, undefined, repos).catch((e) => e);
    expect(error.message).toBe("Issue serving requests from a plan to use this workflow");
    expect(statusFromError(error)).toBe(400);
  });

  it("answers 400 from addPeopleToWorkflow", async () => {
    const error = await WorkflowHelper.addPeopleToWorkflow("c1", "wf1", [{ type: "person", id: "p1" }], undefined, undefined, repos).catch((e) => e);
    expect(error.message).toBe("Issue serving requests from a plan to use this workflow");
    expect(statusFromError(error)).toBe(400);
  });
});
