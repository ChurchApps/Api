const close = jest.fn(async (_task: Task, _outcome: string, _repos: Repos): Promise<void> => undefined);
const completeHumanFollowup = jest.fn(async (t: Task) => t);
jest.mock("../AssignmentWorkflowHelper.js", () => ({ AssignmentWorkflowHelper: { close, completeHumanFollowup } }));
jest.mock("@churchapps/apihelper", () => ({ DateHelper: { addDays: (d: Date, n: number) => new Date(d.getTime() + n * 86400000) } }));
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: jest.fn() } }));
jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: {} }));
jest.mock("../StepActionHelper.js", () => ({
  StepActionHelper: {
    runActionsForStep: jest.fn(async (): Promise<void> => undefined),
    appendHistory: (task: Task, message: string) => {
      const data: CardData = task.data ? JSON.parse(task.data) : {};
      data.history = [...(data.history || []), { date: new Date().toISOString(), message }];
      task.data = JSON.stringify(data);
    }
  }
}));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));

import type { Task, WorkflowStep, WorkflowStepRoute } from "../../models/index.js";
import type { Repos } from "../../repositories/Repos.js";
import type { CardData, HistoryEntry } from "../CardData.js";
// In-memory fakes return partial rows, so each repo method may resolve to a partial of what the real one returns.
type Loose<R> = R extends (infer E)[] ? Partial<E>[] : R extends object ? Partial<R> : R;
type FakeRepo<T> = { [K in keyof T]?: T[K] extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<Loose<R>> : T[K] };
type FakeRepos = { [K in keyof Repos]?: FakeRepo<Repos[K]> };

import { WorkflowHelper } from "../WorkflowHelper.js";

// Remove card closes one card without running outcomes, like deleting a workflow does to its cards.
describe("WorkflowHelper.remove", () => {
  beforeEach(() => { close.mockClear(); completeHumanFollowup.mockClear(); });

  const buildRepos = (stored: Task) => {
    const mocks = {
      workflowStepRoute: { load: jest.fn(), loadForStep: jest.fn(async (): Promise<WorkflowStepRoute[]> => []) },
      workflowStep: { load: jest.fn(), loadForWorkflow: jest.fn(async (): Promise<WorkflowStep[]> => []) },
      task: {
        save: jest.fn(async (t: Task) => t),
        load: jest.fn(async () => stored),
        withAssignmentLock: jest.fn(async (_c: string, _a: string, fn: () => Promise<unknown>) => { await fn(); })
      }
    };
    const fake: FakeRepos = mocks;
    return fake as Repos & typeof mocks;
  };

  it("closes a plain card and adds a Removed history line", async () => {
    const card: Task = { id: "t1", churchId: "c1", workflowId: "w1", stepId: "s1", status: "Open", snoozedUntil: new Date(), data: JSON.stringify({ history: [{ date: "2026-01-01", message: "Created" }] }) };
    const repos = buildRepos(card);
    const result = await WorkflowHelper.remove(card, repos);
    expect(result.status).toBe("Closed");
    expect(result.dateClosed).toBeInstanceOf(Date);
    expect(result.snoozedUntil).toBeNull();
    expect(result.stepId).toBe("s1");
    expect(JSON.parse(result.data).history.map((h: HistoryEntry) => h.message)).toEqual(["Created", "Removed"]);
    expect(repos.task.save).toHaveBeenCalledTimes(1);
    expect(repos.workflowStepRoute.load).not.toHaveBeenCalled();
    expect(repos.workflowStep.load).not.toHaveBeenCalled();
  });

  it("closes a serving card through AssignmentWorkflowHelper.close under the assignment lock", async () => {
    const card: Task = { id: "t2", churchId: "c1", workflowId: "w1", stepId: "s1", status: "Open", assignmentId: "a1" };
    const repos = buildRepos({ ...card });
    await WorkflowHelper.remove(card, repos);
    expect(repos.task.withAssignmentLock).toHaveBeenCalledWith("c1", "a1", expect.any(Function));
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ id: "t2" }), "Removed", repos);
    expect(completeHumanFollowup).not.toHaveBeenCalled();
  });

  it("leaves an already closed serving card alone", async () => {
    const card: Task = { id: "t3", churchId: "c1", status: "Open", assignmentId: "a1" };
    const repos = buildRepos({ ...card, status: "Closed" });
    await WorkflowHelper.remove(card, repos);
    expect(close).not.toHaveBeenCalled();
  });
});
