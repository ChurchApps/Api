jest.mock("../AssignmentWorkflowHelper.js", () => ({ AssignmentWorkflowHelper: { workflowType: "assignmentConfirmation" } }));
jest.mock("@churchapps/apihelper", () => ({ DateHelper: { addDays: (d: Date, n: number) => new Date(d.getTime() + n * 86400000) } }));
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: jest.fn() } }));
jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: {} }));
jest.mock("../StepActionHelper.js", () => ({ StepActionHelper: { runActionsForStep: jest.fn(async () => undefined) } }));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));

import { WorkflowHelper } from "../WorkflowHelper.js";

// Issue #1408: adding someone to a workflow they are already open in does not give them a second card.
describe("WorkflowHelper add skips people who already have an open card", () => {
  const step = { id: "s1", workflowId: "w1", sort: 1, name: "New" };
  const openCard = { id: "t-open", workflowId: "w1", status: "Open", associatedWithType: "person", associatedWithId: "pDonald" };

  const buildRepos = (openFor: Record<string, any>) => ({
    workflow: { load: jest.fn(async () => ({ id: "w1" })) },
    workflowStep: { load: jest.fn(async () => step), loadForWorkflow: jest.fn(async () => [step]) },
    workflowStepAction: { loadForStep: jest.fn(async () => []) },
    workflowStepRoute: { loadForStep: jest.fn(async () => []) },
    task: {
      loadMaxSortForStep: jest.fn(async () => 1),
      save: jest.fn(async (t: any) => ({ ...t, id: "t-" + t.associatedWithId })),
      loadOpenBySubjectInWorkflow: jest.fn(async (_c: string, _w: string, _t: string, id: string) => openFor[id] ?? null)
    }
  }) as any;

  // Step actions are covered in WorkflowActionSteps.test.ts; here only the card count matters.
  beforeEach(() => { jest.spyOn(WorkflowHelper, "onStepEnter").mockResolvedValue(undefined); });
  afterEach(() => jest.restoreAllMocks());

  it("returns the open card instead of adding a second one", async () => {
    const repos = buildRepos({ pDonald: openCard });
    const result = await WorkflowHelper.addToWorkflow("c1", "w1", { type: "person", id: "pDonald", label: "Donald Clark" }, undefined, undefined, repos);
    expect(repos.task.loadOpenBySubjectInWorkflow).toHaveBeenCalledWith("c1", "w1", "person", "pDonald");
    expect(result).toBe(openCard);
    expect(repos.task.save).not.toHaveBeenCalled();
  });

  it("adds again when the only card is closed", async () => {
    const repos = buildRepos({});
    const result = await WorkflowHelper.addToWorkflow("c1", "w1", { type: "person", id: "pDonald", label: "Donald Clark" }, undefined, undefined, repos);
    expect(repos.task.save).toHaveBeenCalled();
    expect(result?.id).toBe("t-pDonald");
  });

  it("bulk add skips people with an open card and only returns new cards", async () => {
    const repos = buildRepos({ pDonald: openCard });
    const result = await WorkflowHelper.addPeopleToWorkflow("c1", "w1", [
      { type: "person", id: "pDonald", label: "Donald Clark" },
      { type: "person", id: "pCarol", label: "Carol Clark" }
    ], undefined, undefined, repos);
    expect(result.map((t) => t.associatedWithId)).toEqual(["pCarol"]);
    expect(new Set(repos.task.save.mock.calls.map((c: any[]) => c[0].associatedWithId))).toEqual(new Set(["pCarol"]));
  });

  it("leaves trigger adds to the rule's own once-per-person setting", async () => {
    const repos = buildRepos({ pDonald: openCard });
    await WorkflowHelper.addToWorkflow("c1", "w1", { type: "person", id: "pDonald", label: "Donald Clark" }, { type: "system", label: "Trigger" }, "trigger1", repos);
    expect(repos.task.loadOpenBySubjectInWorkflow).not.toHaveBeenCalled();
    expect(repos.task.save).toHaveBeenCalled();
  });
});
