jest.mock("../AssignmentWorkflowHelper.js", () => ({ AssignmentWorkflowHelper: { workflowType: "assignmentConfirmation", stopIfResolved: jest.fn(async () => false), processPending: jest.fn(async () => 0) } }));
/** Tests on-enter actions + drip (delay+resume); mocks avoid external deps; repos passed explicitly. */

jest.mock("@churchapps/apihelper", () => ({
  DateHelper: { addDays: (d: Date, n: number) => new Date(d.getTime() + n * 86400000) },
  UniqueIdHelper: { shortId: () => "id" + Math.random().toString(36).slice(2, 8) }
}));

const sendTemplatedEmailMock = jest.fn().mockResolvedValue(true);
const sendPersonTextMock = jest.fn().mockResolvedValue({ ok: true });
const addGroupMemberMock = jest.fn().mockResolvedValue(undefined);
const loadPersonMock = jest.fn().mockResolvedValue({ email: "p@example.com" });
const loadChurchMock = jest.fn().mockResolvedValue({ name: "Demo Church" });
const recordAttendanceMock = jest.fn().mockResolvedValue(1);
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({ loadPerson: loadPersonMock, loadChurch: loadChurchMock, addGroupMember: addGroupMemberMock, setPersonField: jest.fn() }),
  getMessagingModuleGateway: () => ({ sendTemplatedEmail: sendTemplatedEmailMock, sendPersonText: sendPersonTextMock }),
  getAttendanceModuleGateway: () => ({ recordAttendance: recordAttendanceMock })
}));

jest.mock("../../../../shared/webhooks/UrlValidator.js", () => ({ UrlValidator: { validate: jest.fn().mockResolvedValue(null) } }));

const notifyMock = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: notifyMock } }));

jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { b1AdminRoot: "https://admin.test" } }));

const donationExtrasMock = jest.fn(async (_c: string, event: EventContext | undefined) => (event?.donationId ? { amount: "$50.00", fund: "General Fund" } : {}));
jest.mock("../DonationMergeHelper.js", () => ({ DonationMergeHelper: { extras: donationExtrasMock } }));

jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: { personMatchesStepRoute: jest.fn().mockResolvedValue(false) } }));

// Avoid loading the DB/Environment chain (Environment.ts uses import.meta.url, which
// Jest's CJS loader can't parse). Repos are passed in explicitly, so RepoManager is unused.
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));

import { WorkflowHelper } from "../WorkflowHelper.js";
import type { Repos } from "../../repositories/Repos.js";
import type { Task, Workflow, WorkflowStepAction, WorkflowStepRoute } from "../../models/index.js";
import type { HistoryEntry } from "../CardData.js";
import type { EventContext } from "../EventContext.js";

type FakeRepos = { [K in keyof Repos]?: { [M in keyof Repos[K]]?: Repos[K][M] extends (...args: infer A) => unknown ? (...args: A) => unknown : Repos[K][M] } };
const asRepos = (fake: FakeRepos) => fake as Repos;

interface FakeStep { id: string; workflowId: string; sort: number; name: string }

function buildRepos(steps: FakeStep[], actionsByStep: Record<string, WorkflowStepAction[]>, routesByStep: Record<string, WorkflowStepRoute[]> = {}) {
  const stepsById: Record<string, FakeStep> = {};
  steps.forEach((s) => { stepsById[s.id] = s; });
  return {
    workflow: { load: jest.fn(async (): Promise<Workflow | null> => null) },
    workflowStepAction: { loadForStep: jest.fn(async (_c: string, stepId: string) => actionsByStep[stepId] || []) },
    workflowStep: {
      load: jest.fn(async (_c: string, id: string) => stepsById[id] || null),
      loadForWorkflow: jest.fn(async () => [...steps].sort((a, b) => a.sort - b.sort))
    },
    workflowStepRoute: { loadForStep: jest.fn(async (_c: string, stepId: string) => routesByStep[stepId] || []) },
    task: {
      loadMaxSortForStep: jest.fn(async () => 1),
      save: jest.fn(async (t: Task) => t),
      loadSnoozedDueAllChurches: jest.fn(async (): Promise<Task[]> => [])
    }
  };
}

describe("WorkflowHelper on-enter actions", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  const steps: FakeStep[] = [
    { id: "stepA", workflowId: "wf1", sort: 1, name: "A" },
    { id: "stepACT", workflowId: "wf1", sort: 2, name: "Auto" },
    { id: "stepB", workflowId: "wf1", sort: 3, name: "B" }
  ];

  it("runs a step's on-enter action and rests the card on that step", async () => {
    const repos = buildRepos(steps, { stepACT: [{ actionType: "addNote", config: JSON.stringify({ note: "hello" }) }] });
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(task.stepId).toBe("stepACT"); // rests for a human; no auto-advance
    const data = JSON.parse(task.data);
    expect(data.history.map((h: HistoryEntry) => h.message)).toContain("Note: hello");
  });

  it("runs on-enter actions and advances when an onEnter 'always' route is present", async () => {
    const repos = buildRepos(
      steps,
      { stepACT: [{ actionType: "addNote", config: JSON.stringify({ note: "passing through" }) }] },
      { stepACT: [{ id: "r1", trigger: "onEnter", kind: "always", targetStepId: "stepB" }] }
    );
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(task.stepId).toBe("stepB"); // the always route advanced it after the action ran
    expect(JSON.parse(task.data).history.map((h: HistoryEntry) => h.message)).toContain("Note: passing through");
  });

  it("notifies the step's default assignee once when a card lands on them", async () => {
    const withDefault = steps.map((s) => (s.id === "stepACT" ? { ...s, defaultAssignToType: "person", defaultAssignToId: "p9", defaultAssignToLabel: "Donald Clark" } : s));
    const repos = buildRepos(withDefault, {});
    const task: Task = { id: "t1", churchId: "c1", workflowId: "wf1", stepId: "stepA", title: "Pat", associatedWithType: "person", associatedWithId: "p1" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(task.assignedToId).toBe("p9");
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(["p9"], "c1", "task", "t1", "You have been assigned a card: Pat");
  });

  it("does not re-notify when the card already has an assignee", async () => {
    const withDefault = steps.map((s) => (s.id === "stepACT" ? { ...s, defaultAssignToType: "person", defaultAssignToId: "p9" } : s));
    const repos = buildRepos(withDefault, {});
    const task: Task = { id: "t1", churchId: "c1", workflowId: "wf1", stepId: "stepA", assignedToType: "person", assignedToId: "p5" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(task.assignedToId).toBe("p5");
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("treats a route whose condition check throws as not matched and keeps routing", async () => {
    const { ConjunctionHelper } = jest.requireMock("../ConjunctionHelper.js");
    ConjunctionHelper.personMatchesStepRoute.mockRejectedValueOnce(new Error("Invalid condition operator: contains"));
    const repos = buildRepos(steps, {}, {
      stepACT: [
        { id: "r1", trigger: "onEnter", kind: "personMatch", targetStepId: "stepA" },
        { id: "r2", trigger: "onEnter", kind: "always", targetStepId: "stepB" }
      ]
    });
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(task.stepId).toBe("stepB");
    expect(repos.task.save).toHaveBeenCalled();
  });

  it("does NOT run on-enter actions on a manual (suppressed) move", async () => {
    const repos = buildRepos(steps, { stepACT: [{ actionType: "addNote", config: JSON.stringify({ note: "should not run" }) }] });
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos), true); // manual move

    expect(task.stepId).toBe("stepACT");
    expect(task.data).toBeUndefined(); // no action ran, no history written
  });

  it("parks the card on a delay action and saves a resume cursor", async () => {
    const repos = buildRepos(steps, { stepACT: [{ actionType: "delay", config: JSON.stringify({ days: 3 }) }] });
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(task.stepId).toBe("stepACT"); // rests on the step while parked
    expect(task.snoozedUntil).toBeInstanceOf(Date);
    expect(task.snoozedUntil.getTime()).toBeGreaterThan(Date.now());
    expect(JSON.parse(task.data).actionCursor).toEqual({ stepId: "stepACT", index: 1 });
  });

  it("send email then wait then send email: sends, parks, resumes and sends again", async () => {
    const repos = buildRepos(steps, {
      stepACT: [
        { actionType: "sendEmail", sort: 1, config: JSON.stringify({ templateId: "t1" }) },
        { actionType: "delay", sort: 2, config: JSON.stringify({ days: 3 }) },
        { actionType: "sendEmail", sort: 3, config: JSON.stringify({ templateId: "t2" }) }
      ]
    });
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1", associatedWithLabel: "Pat" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));
    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(1); // first email sent on entry
    expect(JSON.parse(task.data).actionCursor).toEqual({ stepId: "stepACT", index: 2 });

    repos.task.loadSnoozedDueAllChurches = jest.fn(async () => [task]);
    const count = await WorkflowHelper.processSnoozed(asRepos(repos));

    expect(count).toBe(1);
    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(2); // reminder sent after the wait
    expect(task.stepId).toBe("stepACT"); // no route → rests for a human
    expect(JSON.parse(task.data).actionCursor).toBeUndefined(); // sequence finished
    expect(notifyMock).not.toHaveBeenCalled(); // automation wake never pings an assignee
  });

  it("notifies the assignee when an ordinary human snooze ends (no cursor)", async () => {
    const repos = buildRepos(steps, {});
    const card: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", snoozedUntil: new Date(Date.now() - 1000), assignedToType: "person", assignedToId: "p1", title: "Follow up" };
    repos.task.loadSnoozedDueAllChurches = jest.fn(async () => [card]);

    const count = await WorkflowHelper.processSnoozed(asRepos(repos));

    expect(count).toBe(1);
    expect(notifyMock).toHaveBeenCalled();
  });

  it("clears the snooze with null so the saved card is not picked up again", async () => {
    const repos = buildRepos(steps, {});
    const card: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", snoozedUntil: new Date(Date.now() - 1000), title: "Follow up" };
    repos.task.loadSnoozedDueAllChurches = jest.fn(async () => [card]);

    await WorkflowHelper.processSnoozed(asRepos(repos));

    expect(repos.task.save).toHaveBeenCalledWith(expect.objectContaining({ snoozedUntil: null }));
  });

  it("runs a non-delay action (addToGroup) then rests", async () => {
    const repos = buildRepos(steps, { stepACT: [{ actionType: "addToGroup", config: JSON.stringify({ groupId: "g1", groupLabel: "Greeters" }) }] });
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(addGroupMemberMock).toHaveBeenCalledWith("c1", "g1", "p1");
    expect(task.stepId).toBe("stepACT");
  });
});

describe("WorkflowHelper notifyPerson action", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  const steps: FakeStep[] = [
    { id: "stepA", workflowId: "wf1", sort: 1, name: "New" },
    { id: "stepN", workflowId: "wf1", sort: 2, name: "Pastor call" }
  ];

  it("emails and notifies the chosen person with the card's person, workflow, step and message", async () => {
    const repos = buildRepos(steps, { stepN: [{ actionType: "notifyPerson", config: JSON.stringify({ personId: "p9", personLabel: "Pastor", message: "Please call" }) }] });
    repos.workflow.load = jest.fn(async () => ({ id: "wf1", name: "Lapsed Givers" }));
    const task: Task = { id: "t1", churchId: "c1", workflowId: "wf1", stepId: "stepA", title: "Check in", associatedWithType: "person", associatedWithId: "p1", associatedWithLabel: "Donald Clark" };

    await WorkflowHelper.moveToStep(task, "stepN", asRepos(repos));

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      ["p9"],
      "c1",
      "task",
      "t1",
      "Donald Clark — Lapsed Givers: Pastor call. Please call",
      "https://admin.test/serving/tasks/t1",
      undefined,
      expect.objectContaining({ emailImmediate: true })
    );
    expect(JSON.parse(task.data).history.map((h: HistoryEntry) => h.message)).toContain("Notified Pastor");
  });

  it("counts the email against the church email allowance, since it carries the church's message", async () => {
    const repos = buildRepos(steps, { stepN: [{ actionType: "notifyPerson", config: JSON.stringify({ personId: "p9", message: "Please call" }) }] });
    const task: Task = { id: "t1", churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1", associatedWithLabel: "Donald Clark" };

    await WorkflowHelper.moveToStep(task, "stepN", asRepos(repos));

    expect(notifyMock).toHaveBeenCalledWith(["p9"], "c1", "task", "t1", expect.any(String), expect.any(String), undefined, expect.objectContaining({ emailImmediate: true, churchAuthored: true }));
  });

  it("does nothing when no person is picked", async () => {
    const repos = buildRepos(steps, { stepN: [{ actionType: "notifyPerson", config: JSON.stringify({ message: "Please call" }) }] });
    const task: Task = { id: "t1", churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1", associatedWithLabel: "Donald Clark" };

    await WorkflowHelper.moveToStep(task, "stepN", asRepos(repos));

    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe("WorkflowHelper sendText action", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  const steps: FakeStep[] = [
    { id: "stepA", workflowId: "wf1", sort: 1, name: "A" },
    { id: "stepACT", workflowId: "wf1", sort: 2, name: "Auto" }
  ];
  const textAction = { actionType: "sendText", config: JSON.stringify({ message: "Hi {{firstName}}, welcome to {{churchName}}!" }) };
  const newTask = (): Task => ({ churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1", associatedWithLabel: "Donald Clark" });
  const historyOf = (task: Task): string[] => JSON.parse(task.data || "{}").history?.map((h: HistoryEntry) => h.message) || [];

  it("sends the step's message to the person's mobile phone", async () => {
    loadPersonMock.mockResolvedValueOnce({ id: "p1", firstName: "Donald", lastName: "Clark", mobilePhone: " 555-0100 " });
    const repos = buildRepos(steps, { stepACT: [textAction] });
    const task = newTask();

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(sendPersonTextMock).toHaveBeenCalledWith(
      "c1",
      "p1",
      { phoneNumber: "555-0100", firstName: "Donald", lastName: "Clark", displayName: "Donald Clark" },
      "Hi {{firstName}}, welcome to {{churchName}}!",
      "Demo Church",
      {}
    );
    expect(historyOf(task)).toContain("Text sent");
  });

  it("passes the person's donor number so {{donorNumber}} resolves", async () => {
    loadPersonMock.mockResolvedValueOnce({ id: "p1", firstName: "Donald", lastName: "Clark", mobilePhone: "555-0100", donorNumber: "1042" });
    const repos = buildRepos(steps, { stepACT: [textAction] });

    await WorkflowHelper.moveToStep(newTask(), "stepACT", asRepos(repos));

    expect(sendPersonTextMock.mock.calls[0][2]).toEqual(expect.objectContaining({ donorNumber: "1042" }));
  });

  it("skips a person who opted out of texts", async () => {
    loadPersonMock.mockResolvedValueOnce({ id: "p1", firstName: "Donald", mobilePhone: "555-0100", smsOptedOut: 1 });
    const repos = buildRepos(steps, { stepACT: [textAction] });
    const task = newTask();

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(sendPersonTextMock).not.toHaveBeenCalled();
    expect(historyOf(task)).toContain("Text skipped: opted out");
  });

  it("skips a person with no mobile phone", async () => {
    loadPersonMock.mockResolvedValueOnce({ id: "p1", firstName: "Donald", mobilePhone: "" });
    const repos = buildRepos(steps, { stepACT: [textAction] });
    const task = newTask();

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(sendPersonTextMock).not.toHaveBeenCalled();
    expect(historyOf(task)).not.toContain("Text sent");
    expect(historyOf(task)).toContain("Text skipped: no mobile phone");
  });

  it("records a missing provider on the card and keeps running later actions", async () => {
    loadPersonMock.mockResolvedValueOnce({ id: "p1", firstName: "Donald", mobilePhone: "555-0100" });
    sendPersonTextMock.mockResolvedValueOnce({ ok: false, reason: "no_provider" });
    const repos = buildRepos(steps, { stepACT: [textAction, { actionType: "addNote", config: JSON.stringify({ note: "after" }) }] });
    const task = newTask();

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(historyOf(task)).toContain("Action sendText failed: no_provider");
    expect(historyOf(task)).toContain("Note: after");
  });
});

describe("WorkflowHelper sendEmail action", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  const steps: FakeStep[] = [
    { id: "stepA", workflowId: "wf1", sort: 1, name: "A" },
    { id: "stepACT", workflowId: "wf1", sort: 2, name: "Auto" }
  ];

  it("passes the person's first and last name so {{firstName}} resolves", async () => {
    loadPersonMock.mockResolvedValueOnce({ id: "p1", email: "donald@example.com", firstName: "Donald", lastName: "Clark" });
    const repos = buildRepos(steps, { stepACT: [{ actionType: "sendEmail", config: JSON.stringify({ templateId: "t1" }) }] });
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1", associatedWithLabel: "Donald Clark" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(sendTemplatedEmailMock).toHaveBeenCalledWith(
      "c1",
      "p1",
      "t1",
      { email: "donald@example.com", firstName: "Donald", lastName: "Clark", displayName: "Donald Clark" },
      "Demo Church",
      undefined,
      {}
    );
  });

  it("passes the person's donor number so {{donorNumber}} resolves", async () => {
    loadPersonMock.mockResolvedValueOnce({ id: "p1", email: "donald@example.com", firstName: "Donald", lastName: "Clark", donorNumber: "1042" });
    const repos = buildRepos(steps, { stepACT: [{ actionType: "sendEmail", config: JSON.stringify({ templateId: "t1" }) }] });
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1", associatedWithLabel: "Donald Clark" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(sendTemplatedEmailMock.mock.calls[0][3]).toEqual(expect.objectContaining({ donorNumber: "1042" }));
  });

  it("stores the gift on a donation-started card and fills the gift fields in its email", async () => {
    loadPersonMock.mockResolvedValueOnce({ id: "p1", email: "donald@example.com", firstName: "Donald", lastName: "Clark" });
    const repos = buildRepos([{ id: "stepACT", workflowId: "wf1", sort: 1, name: "Auto" }], { stepACT: [{ actionType: "sendEmail", config: JSON.stringify({ templateId: "t1" }) }] });
    const event = { type: "donation.created", donationId: "d1", amount: 50, currency: "usd", method: "Check" };

    const card = await WorkflowHelper.addToWorkflow("c1", "wf1", { type: "person", id: "p1", label: "Donald Clark" }, { type: "system", label: "Trigger" }, "t1", asRepos(repos), undefined, 0, event);

    expect(JSON.parse(card?.data || "{}").event).toEqual(event);
    expect(donationExtrasMock).toHaveBeenCalledWith("c1", event, "html");
    expect(sendTemplatedEmailMock).toHaveBeenCalledWith(
      "c1",
      "p1",
      "t1",
      { email: "donald@example.com", firstName: "Donald", lastName: "Clark", displayName: "Donald Clark" },
      "Demo Church",
      undefined,
      { amount: "$50.00", fund: "General Fund" }
    );
  });
});

describe("WorkflowHelper recordAttendance action", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  const steps: FakeStep[] = [
    { id: "stepA", workflowId: "wf1", sort: 1, name: "A" },
    { id: "stepACT", workflowId: "wf1", sort: 2, name: "Auto" }
  ];
  const action = { actionType: "recordAttendance", config: JSON.stringify({ groupId: "g1", groupLabel: "Sunday Night Service" }) };

  it("records the person's attendance at the time the card was created", async () => {
    const repos = buildRepos(steps, { stepACT: [action] });
    const created = new Date("2026-10-25T23:50:00Z");
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1", dateCreated: created };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(recordAttendanceMock).toHaveBeenCalledWith("c1", "p1", "g1", created);
    expect(JSON.parse(task.data).history.map((h: HistoryEntry) => h.message)).toContain("Attendance recorded: Sunday Night Service");
  });

  it("notes on the card when no scheduled service is in progress", async () => {
    recordAttendanceMock.mockResolvedValueOnce(0);
    const repos = buildRepos(steps, { stepACT: [action] });
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "person", associatedWithId: "p1" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(JSON.parse(task.data).history.map((h: HistoryEntry) => h.message)).toContain("No scheduled service in progress — attendance not recorded");
  });

  it("skips a card that is not about a person", async () => {
    const repos = buildRepos(steps, { stepACT: [action] });
    const task: Task = { churchId: "c1", workflowId: "wf1", stepId: "stepA", associatedWithType: "group", associatedWithId: "g9" };

    await WorkflowHelper.moveToStep(task, "stepACT", asRepos(repos));

    expect(recordAttendanceMock).not.toHaveBeenCalled();
  });
});
