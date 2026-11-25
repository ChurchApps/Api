jest.mock("../AssignmentWorkflowHelper.js", () => ({ AssignmentWorkflowHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({ DateHelper: {} }));
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: jest.fn() } }));
jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: {} }));
jest.mock("../StepActionHelper.js", () => ({
  StepActionHelper: {
    appendHistory: (task: Task, message: string) => {
      const data: CardData = task.data ? JSON.parse(task.data) : {};
      data.history = [...(data.history || []), { date: new Date().toISOString(), message }];
      task.data = JSON.stringify(data);
    }
  }
}));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));

import type { Task } from "../../models/index.js";
import type { Repos } from "../../repositories/Repos.js";
import type { CardData, HistoryEntry } from "../CardData.js";
// In-memory fakes return partial rows, so each repo method may resolve to a partial of what the real one returns.
type Loose<R> = R extends (infer E)[] ? Partial<E>[] : R extends object ? Partial<R> : R;
type FakeRepo<T> = { [K in keyof T]?: T[K] extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<Loose<R>> : T[K] };
type FakeRepos = { [K in keyof Repos]?: FakeRepo<Repos[K]> };

import { WorkflowHelper } from "../WorkflowHelper.js";
import { NotificationService } from "../../../../shared/helpers/NotificationService.js";

// Reassigning a card leaves a line in its history so the hand-off is visible later.
describe("WorkflowHelper.reassign", () => {
  const buildRepos = () => {
    const fake: FakeRepos = { task: { save: jest.fn(async (t: Task) => t) } };
    return fake as Repos;
  };
  const history = (task: Task) => (task.data ? (JSON.parse(task.data) as CardData).history.map((h: HistoryEntry) => h.message) : []);

  it("records who the card moved from and to", async () => {
    const card: Task = { id: "t1", churchId: "c1", workflowId: "w1", assignedToType: "person", assignedToId: "p1", assignedToLabel: "Donald Clark" };
    const result = await WorkflowHelper.reassign(card, { type: "person", id: "p2", label: "Carol Clark" }, buildRepos());
    expect(result.assignedToId).toBe("p2");
    expect(history(result)).toEqual(["Reassigned from Donald Clark to Carol Clark"]);
  });

  it("says unassigned when the card had no assignee", async () => {
    const card: Task = { id: "t1", churchId: "c1", workflowId: "w1" };
    const result = await WorkflowHelper.reassign(card, { type: "person", id: "p2", label: "Carol Clark" }, buildRepos());
    expect(history(result)).toEqual(["Reassigned from unassigned to Carol Clark"]);
  });

  it("adds nothing when the assignee does not change", async () => {
    const card: Task = { id: "t1", churchId: "c1", workflowId: "w1", assignedToType: "person", assignedToId: "p1", assignedToLabel: "Donald Clark" };
    const result = await WorkflowHelper.reassign(card, { type: "person", id: "p1", label: "Donald Clark" }, buildRepos());
    expect(history(result)).toEqual([]);
  });

  it("notifies someone else who is given the card", async () => {
    (NotificationService.createNotifications as jest.Mock).mockClear();
    const card: Task = { id: "t1", churchId: "c1", workflowId: "w1" };
    await WorkflowHelper.reassign(card, { type: "person", id: "p2", label: "Carol Clark" }, buildRepos(), "p1");
    expect(NotificationService.createNotifications).toHaveBeenCalledWith(["p2"], "c1", "task", "t1", expect.any(String));
  });

  it("stays quiet when people assign the card to themselves", async () => {
    (NotificationService.createNotifications as jest.Mock).mockClear();
    const card: Task = { id: "t1", churchId: "c1", workflowId: "w1" };
    await WorkflowHelper.reassign(card, { type: "person", id: "p2", label: "Carol Clark" }, buildRepos(), "p2");
    expect(NotificationService.createNotifications).not.toHaveBeenCalled();
  });
});
