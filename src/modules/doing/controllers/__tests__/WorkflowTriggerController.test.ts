import "reflect-metadata";
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ EventTriggerHelper: {}, ExecutionHelper: {}, RuleEngine: { runScheduled: jest.fn() } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: {} }));

import { WorkflowTriggerController } from "../WorkflowTriggerController.js";

describe("WorkflowTriggerController.keyMatches", () => {
  it("matches only the exact internal key", () => {
    expect(WorkflowTriggerController.keyMatches("secret", "secret")).toBe(true);
    expect(WorkflowTriggerController.keyMatches("secreT", "secret")).toBe(false);
    expect(WorkflowTriggerController.keyMatches("", "secret")).toBe(false);
    expect(WorkflowTriggerController.keyMatches(undefined, "secret")).toBe(false);
  });
});
