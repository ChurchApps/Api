jest.mock("../AssignmentWorkflowHelper.js", () => ({ AssignmentWorkflowHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({ DateHelper: {} }));
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: jest.fn() } }));
jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: {} }));
jest.mock("../StepActionHelper.js", () => ({
  StepActionHelper: {
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

// Reassigning a card leaves a line in its history so the hand-off is visible later.
describe("WorkflowHelper.reassign", () => {
  const buildRepos = () => ({ task: { save: jest.fn(async (t: any) => t) } }) as any;
  const history = (task: any) => (task.data ? JSON.parse(task.data).history.map((h: any) => h.message) : []);

  it("records who the card moved from and to", async () => {
    const card: any = { id: "t1", churchId: "c1", workflowId: "w1", assignedToType: "person", assignedToId: "p1", assignedToLabel: "Donald Clark" };
    const result = await WorkflowHelper.reassign(card, { type: "person", id: "p2", label: "Carol Clark" }, buildRepos());
    expect(result.assignedToId).toBe("p2");
    expect(history(result)).toEqual(["Reassigned from Donald Clark to Carol Clark"]);
  });

  it("says unassigned when the card had no assignee", async () => {
    const card: any = { id: "t1", churchId: "c1", workflowId: "w1" };
    const result = await WorkflowHelper.reassign(card, { type: "person", id: "p2", label: "Carol Clark" }, buildRepos());
    expect(history(result)).toEqual(["Reassigned from unassigned to Carol Clark"]);
  });

  it("adds nothing when the assignee does not change", async () => {
    const card: any = { id: "t1", churchId: "c1", workflowId: "w1", assignedToType: "person", assignedToId: "p1", assignedToLabel: "Donald Clark" };
    const result = await WorkflowHelper.reassign(card, { type: "person", id: "p1", label: "Donald Clark" }, buildRepos());
    expect(history(result)).toEqual([]);
  });
});
