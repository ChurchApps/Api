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

// Production: 5 "Issue serving requests from a plan to use this workflow" 500s on /doing/tasks/addToWorkflow and
// bulkAddToWorkflow. Asking to add people to a plan-driven workflow is a bad request, not a server failure.
describe("WorkflowHelper with an assignment confirmation workflow", () => {
  const repos: any = { workflow: { load: jest.fn(async () => ({ id: "wf1", workflowType: "assignmentConfirmation" })) } };

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
