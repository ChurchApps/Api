const close = jest.fn(async () => undefined);
const completeHumanFollowup = jest.fn(async (t: any) => t);
jest.mock("../AssignmentWorkflowHelper.js", () => ({ AssignmentWorkflowHelper: { close, completeHumanFollowup } }));
jest.mock("@churchapps/apihelper", () => ({ DateHelper: { addDays: (d: Date, n: number) => new Date(d.getTime() + n * 86400000) } }));
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: jest.fn() } }));
jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: {} }));
jest.mock("../StepActionHelper.js", () => ({
  StepActionHelper: {
    runActionsForStep: jest.fn(async () => undefined),
    appendHistory: (task: any, message: string) => {
      const data = task.data ? JSON.parse(task.data) : {};
      data.history = [...(data.history || []), { date: new Date().toISOString(), message }];
      task.data = JSON.stringify(data);
    }
  }
}));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));

import { WorkflowHelper } from "../WorkflowHelper.js";

// Remove card closes one card without running outcomes, like deleting a workflow does to its cards.
describe("WorkflowHelper.remove", () => {
  beforeEach(() => { close.mockClear(); completeHumanFollowup.mockClear(); });

  const buildRepos = (stored: any) => ({
    workflowStepRoute: { load: jest.fn(), loadForStep: jest.fn(async () => []) },
    workflowStep: { load: jest.fn(), loadForWorkflow: jest.fn(async () => []) },
    task: {
      save: jest.fn(async (t: any) => t),
      load: jest.fn(async () => stored),
      withAssignmentLock: jest.fn(async (_c: string, _a: string, fn: () => Promise<void>) => { await fn(); })
    }
  }) as any;

  it("closes a plain card and adds a Removed history line", async () => {
    const card: any = { id: "t1", churchId: "c1", workflowId: "w1", stepId: "s1", status: "Open", snoozedUntil: new Date(), data: JSON.stringify({ history: [{ date: "2026-01-01", message: "Created" }] }) };
    const repos = buildRepos(card);
    const result = await WorkflowHelper.remove(card, repos);
    expect(result.status).toBe("Closed");
    expect(result.dateClosed).toBeInstanceOf(Date);
    expect(result.snoozedUntil).toBeNull();
    expect(result.stepId).toBe("s1");
    expect(JSON.parse(result.data).history.map((h: any) => h.message)).toEqual(["Created", "Removed"]);
    expect(repos.task.save).toHaveBeenCalledTimes(1);
    expect(repos.workflowStepRoute.load).not.toHaveBeenCalled();
    expect(repos.workflowStep.load).not.toHaveBeenCalled();
  });

  it("closes a serving card through AssignmentWorkflowHelper.close under the assignment lock", async () => {
    const card: any = { id: "t2", churchId: "c1", workflowId: "w1", stepId: "s1", status: "Open", assignmentId: "a1" };
    const repos = buildRepos({ ...card });
    await WorkflowHelper.remove(card, repos);
    expect(repos.task.withAssignmentLock).toHaveBeenCalledWith("c1", "a1", expect.any(Function));
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ id: "t2" }), "Removed", repos);
    expect(completeHumanFollowup).not.toHaveBeenCalled();
  });

  it("leaves an already closed serving card alone", async () => {
    const card: any = { id: "t3", churchId: "c1", status: "Open", assignmentId: "a1" };
    const repos = buildRepos({ ...card, status: "Closed" });
    await WorkflowHelper.remove(card, repos);
    expect(close).not.toHaveBeenCalled();
  });
});
