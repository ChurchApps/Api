/**
 * Unit tests for action steps: a card entering a stepType="action" step runs the
 * step's automated actions and then auto-advances, except for a "delay" action,
 * which parks the card (snooze) until processSnoozed wakes and advances it.
 *
 * Gateways, apihelper (ESM), the SSRF validator and notifications are mocked so
 * the test runs without a DB or any external service. Repos are passed in
 * explicitly (WorkflowHelper accepts a repos argument), so no RepoManager.
 */

jest.mock("@churchapps/apihelper", () => ({
  DateHelper: { addDays: (d: Date, n: number) => new Date(d.getTime() + n * 86400000) },
  UniqueIdHelper: { shortId: () => "id" + Math.random().toString(36).slice(2, 8) }
}));

const sendTemplatedEmailMock = jest.fn().mockResolvedValue(true);
const addGroupMemberMock = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({ loadPerson: jest.fn(), loadChurch: jest.fn(), addGroupMember: addGroupMemberMock, setPersonField: jest.fn() }),
  getMessagingModuleGateway: () => ({ sendTemplatedEmail: sendTemplatedEmailMock })
}));

jest.mock("../../../../shared/webhooks/UrlValidator.js", () => ({ UrlValidator: { validate: jest.fn().mockResolvedValue(null) } }));

const notifyMock = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: notifyMock } }));

jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: { personMatchesStepRoute: jest.fn().mockResolvedValue(false) } }));

// Avoid loading the DB/Environment chain (Environment.ts uses import.meta.url, which
// Jest's CJS loader can't parse). Repos are passed in explicitly, so RepoManager is unused.
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));

import { WorkflowHelper } from "../WorkflowHelper.js";

interface FakeStep { id: string; workflowId: string; sort: number; stepType?: string; name: string }

function buildRepos(steps: FakeStep[], actionsByStep: Record<string, any[]>) {
  const stepsById: Record<string, FakeStep> = {};
  steps.forEach((s) => { stepsById[s.id] = s; });
  return {
    workflowStepAction: { loadForStep: jest.fn(async (_c: string, stepId: string) => actionsByStep[stepId] || []) },
    workflowStep: {
      load: jest.fn(async (_c: string, id: string) => stepsById[id] || null),
      loadForWorkflow: jest.fn(async () => [...steps].sort((a, b) => a.sort - b.sort))
    },
    workflowStepRoute: { loadForStep: jest.fn(async () => []) },
    task: {
      loadMaxSortForStep: jest.fn(async () => 1),
      save: jest.fn(async (t: any) => t),
      loadSnoozedDueAllChurches: jest.fn(async () => [])
    }
  } as any;
}

describe("WorkflowHelper action steps", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  const steps: FakeStep[] = [
    { id: "stepA", workflowId: "wf1", sort: 1, stepType: "human", name: "A" },
    { id: "stepACT", workflowId: "wf1", sort: 2, stepType: "action", name: "Auto" },
    { id: "stepB", workflowId: "wf1", sort: 3, stepType: "human", name: "B" }
  ];

  it("auto-advances a card through an action step to the next human step", async () => {
    const repos = buildRepos(steps, { stepACT: [{ actionType: "addNote", config: JSON.stringify({ note: "hello" }) }] });
    const task: any = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1" };

    await WorkflowHelper.moveToStep(task, "stepACT", repos);

    expect(task.stepId).toBe("stepB"); // passed through the action step
    const data = JSON.parse(task.data);
    expect(data.history.map((h: any) => h.message)).toContain("Note: hello");
  });

  it("parks the card on a delay action and does not advance", async () => {
    const repos = buildRepos(steps, { stepACT: [{ actionType: "delay", config: JSON.stringify({ days: 3 }) }] });
    const task: any = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1" };

    await WorkflowHelper.moveToStep(task, "stepACT", repos);

    expect(task.stepId).toBe("stepACT"); // rests on the action step
    expect(task.snoozedUntil).toBeInstanceOf(Date);
    expect(task.snoozedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it("advances a woken delay card past the action step without notifying", async () => {
    const repos = buildRepos(steps, { stepACT: [{ actionType: "delay", config: JSON.stringify({ days: 3 }) }] });
    const parked: any = { churchId: "c1", workflowId: "wf1", stepId: "stepACT", snoozedUntil: new Date(Date.now() - 1000), associatedWithType: "person", associatedWithId: "p1" };
    repos.task.loadSnoozedDueAllChurches = jest.fn(async () => [parked]);

    const count = await WorkflowHelper.processSnoozed(repos);

    expect(count).toBe(1);
    expect(parked.stepId).toBe("stepB"); // advanced off the action step on wake
    expect(notifyMock).not.toHaveBeenCalled(); // action-step wake never pings an assignee
  });

  it("runs a non-delay action (addToGroup) then advances", async () => {
    const repos = buildRepos(steps, { stepACT: [{ actionType: "addToGroup", config: JSON.stringify({ groupId: "g1", groupLabel: "Greeters" }) }] });
    const task: any = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1" };

    await WorkflowHelper.moveToStep(task, "stepACT", repos);

    expect(addGroupMemberMock).toHaveBeenCalledWith("c1", "g1", "p1");
    expect(task.stepId).toBe("stepB");
  });
});
