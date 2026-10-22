import "reflect-metadata";

jest.mock("@churchapps/apihelper", () => ({ DateHelper: { addDays: (d: Date, n: number) => new Date(d.getTime() + n * 86400000) } }));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { jwtSecret: "synthetic-test-secret", doingApi: "http://localhost/doing" } }));
const delivery = jest.fn(async () => "sent");
const notify = jest.fn(async () => []);
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: (...args: any[]) => notify(...args) } }));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({ loadGroupLeaderPersonIds: async () => [], loadPerson: async (_c: string, id: string) => ({ id, displayName: "Sample Volunteer", email: "volunteer@example.test", mobilePhone: "+15555550123" }), loadChurch: async () => ({ name: "Sample Church", timeZone: "UTC", subDomain: "example" }) }),
  getMessagingModuleGateway: () => ({ sendServingWorkflowMessage: (...args: any[]) => delivery(...args) })
}));
jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: { personMatchesStepRoute: jest.fn(async () => false) } }));
jest.mock("../../../../shared/webhooks/UrlValidator.js", () => ({ UrlValidator: { validate: jest.fn(async () => null) } }));

import { AssignmentWorkflowHelper as Followup } from "../AssignmentWorkflowHelper.js";
import { WorkflowHelper } from "../WorkflowHelper.js";
import { WorkflowTemplates } from "../WorkflowTemplates.js";

const clone = <T>(value: T): T => value == null ? value : structuredClone(value);
function fixture() {
  let id = 0;
  const plans: any[] = [{ id: "plan1", churchId: "c1", ministryId: "ministry1", name: "Sample Service", serviceDate: new Date(2030, 3, 7), confirmationWorkflowId: "wf1" }];
  const positions: any[] = [{ id: "pos1", churchId: "c1", planId: "plan1", name: "Greeter" }];
  const assignments: any[] = [{ id: "a1", churchId: "c1", positionId: "pos1", personId: "p1", status: "Unconfirmed" }];
  const workflows: any[] = [{ id: "wf1", churchId: "c1", active: true, workflowType: "assignmentConfirmation" }];
  const steps: any[] = [{ id: "s1", churchId: "c1", workflowId: "wf1", name: "Wait" }, { id: "s2", churchId: "c1", workflowId: "wf1", name: "Call", expectedResponseDays: 1, defaultAssignToType: "person", defaultAssignToId: "leader1", defaultAssignToLabel: "Sample Leader" }];
  const actions: any[] = WorkflowTemplates.get("assignmentConfirmation").steps[0].actions.map((a, i) => ({ ...a, config: JSON.stringify(a.config || {}), id: `action${i}`, stepId: "s1" }));
  const tasks: any[] = [];
  const locks = new Set<string>();
  const load = (list: any[]) => jest.fn(async (c: string, key: string) => clone(list.find((x) => x.churchId === c && x.id === key) || null));
  const repos: any = {
    time: { loadByPlanId: jest.fn(async () => []) },
    plan: { load: load(plans) },
    position: { load: load(positions) },
    workflow: { load: load(workflows) },
    assignment: {
      load: load(assignments),
      loadByPlanId: jest.fn(async (c: string, plan: string) => clone(assignments.filter((a) => a.churchId === c && positions.some((p) => p.id === a.positionId && p.planId === plan)))),
      issueConfirmation: jest.fn(async (c: string, key: string, workflowId: string) => { const a = assignments.find((x) => x.churchId === c && x.id === key); if (a?.status !== "Unconfirmed" || a.notified || a.confirmationWorkflowId) return false; Object.assign(a, { confirmationWorkflowId: workflowId, notified: new Date() }); return true; }),
      loadIssuedConfirmations: jest.fn(async () => clone(assignments.filter((a) => a.confirmationWorkflowId && a.status === "Unconfirmed" && !tasks.some((t) => t.followupKey === a.id && t.churchId === a.churchId))))
    },
    workflowStep: { load: load(steps), loadForWorkflow: jest.fn(async (c: string, w: string) => clone(steps.filter((s) => s.churchId === c && s.workflowId === w))) },
    workflowStepAction: { loadForStep: jest.fn(async (_c: string, stepId: string) => clone(actions.filter((a) => a.stepId === stepId))) },
    workflowStepRoute: { loadForStep: jest.fn(async (_c: string, stepId: string) => stepId === "s1" ? [{ id: "route1", trigger: "onEnter", kind: "always", targetStepId: "s2" }] : []) },
    task: {
      load: load(tasks),
      loadMaxSortForStep: jest.fn(async () => 1),
      save: jest.fn(async (task: any) => { task.id ||= `task${++id}`; const i = tasks.findIndex((t) => t.id === task.id && t.churchId === task.churchId); if (i === -1) tasks.push(clone(task)); else tasks[i] = clone(task); return task; }),
      loadByFollowupKey: jest.fn(async (c: string, key: string) => clone(tasks.find((t) => t.churchId === c && t.followupKey === key) || null)),
      loadForAssignment: jest.fn(async (c: string, key: string) => clone(tasks.filter((t) => t.churchId === c && t.assignmentId === key && t.status === "Open"))),
      loadOpenAssignmentCards: jest.fn(async () => clone(tasks.filter((t) => t.assignmentId && t.workflowId && t.status === "Open"))),
      loadSnoozedDueAllChurches: jest.fn(async () => clone(tasks.filter((t) => t.status === "Open" && t.snoozedUntil && new Date(t.snoozedUntil) <= new Date()))),
      withAssignmentLock: jest.fn(async (c: string, key: string, fn: () => Promise<any>) => { const lock = `${c}/${key}`; if (locks.has(lock)) return null; locks.add(lock); try { return await fn(); } finally { locks.delete(lock); } })
    }
  };
  return { repos, plans, positions, assignments, workflows, steps, actions, tasks };
}

beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers().setSystemTime(new Date("2030-04-01T12:00:00Z")); delivery.mockResolvedValue("sent"); });
afterEach(() => jest.useRealTimers());

it("suppresses draft requests and rejects a workflow from another church", async () => {
  const f = fixture(); f.plans[0].prepared = true;
  await expect(Followup.issuePlan("c1", "plan1", f.repos)).rejects.toThrow("Publish");
  f.plans[0].prepared = false; f.workflows[0].churchId = "c2";
  await expect(Followup.issuePlan("c1", "plan1", f.repos)).rejects.toThrow("this church");
  expect(delivery).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
});

it("does not backfill old notified/imported assignments or self-signups", async () => {
  const f = fixture(); f.assignments[0].notified = new Date();
  f.assignments.push({ ...f.assignments[0], id: "accepted", status: "Accepted", notified: undefined });
  await Followup.issuePlan("c1", "plan1", f.repos);
  expect(f.tasks).toHaveLength(0); expect(delivery).not.toHaveBeenCalled();
});

it("issues one durable card and app alert per request, even with concurrent issuance and retries", async () => {
  const f = fixture();
  await Promise.all([Followup.issuePlan("c1", "plan1", f.repos), Followup.issuePlan("c1", "plan1", f.repos)]);
  await Followup.issuePlan("c1", "plan1", f.repos); await Followup.processPending(f.repos);
  expect(f.tasks).toHaveLength(1); expect(delivery).toHaveBeenCalledTimes(2); expect(notify).toHaveBeenCalledTimes(1);
  expect(notify.mock.calls[0][7]).toEqual({ appOnly: true, category: "serving_schedule" });
  expect(f.tasks[0].snoozedUntil).toEqual(new Date("2030-04-03T12:00:00Z"));
  expect(JSON.parse(f.tasks[0].data).assignment).toMatchObject({ planId: "plan1", positionId: "pos1", personId: "p1" });
});

it.each(["Accepted", "Declined"])("closes on %s during a wait and never sends the next message", async (status) => {
  const f = fixture(); await Followup.issuePlan("c1", "plan1", f.repos);
  f.assignments[0].status = status;
  jest.setSystemTime(new Date("2030-04-04T12:00:00Z"));
  await WorkflowHelper.processSnoozed(f.repos);
  expect(delivery).toHaveBeenCalledTimes(2); expect(f.tasks[0].status).toBe("Closed"); expect(f.tasks[0].snoozedUntil).toBeNull();
  expect(JSON.parse(f.tasks[0].data).assignmentOutcome).toBe(status);
});

it("rechecks live response between two actions in the same wake", async () => {
  const f = fixture(); delivery.mockImplementationOnce(async () => { f.assignments[0].status = "Accepted"; return "sent"; });
  await Followup.issuePlan("c1", "plan1", f.repos);
  expect(delivery).toHaveBeenCalledTimes(1); expect(f.tasks[0].status).toBe("Closed");
});

it("keeps two requests for one person independent, including a replacement request", async () => {
  const f = fixture(); f.positions.push({ ...f.positions[0], id: "pos2", name: "Host" });
  f.assignments.push({ ...f.assignments[0], id: "a2", positionId: "pos2" });
  await Followup.issuePlan("c1", "plan1", f.repos);
  f.assignments[0].status = "Declined"; await Followup.reconcileAssignment("c1", "a1", f.repos);
  f.assignments.push({ id: "replacement", churchId: "c1", positionId: "pos1", personId: "p2", status: "Unconfirmed" });
  await Followup.issuePlan("c1", "plan1", f.repos);
  expect(f.tasks.map((t) => [t.assignmentId, t.status])).toEqual([["a1", "Closed"], ["a2", "Open"], ["replacement", "Open"]]);
});

it("resumes waits and routes into an assigned human call card with a due date and history", async () => {
  const f = fixture(); await Followup.issuePlan("c1", "plan1", f.repos);
  jest.setSystemTime(new Date("2030-04-03T12:01:00Z")); await WorkflowHelper.processSnoozed(f.repos);
  expect(delivery).toHaveBeenCalledTimes(3);
  jest.setSystemTime(new Date("2030-04-04T12:02:00Z")); await WorkflowHelper.processSnoozed(f.repos);
  expect(f.tasks[0]).toMatchObject({ stepId: "s2", status: "Open", assignedToId: "leader1" });
  expect(new Date(f.tasks[0].dueDate).toISOString()).toBe("2030-04-05T12:02:00.000Z");
  expect(JSON.parse(f.tasks[0].data).history).toEqual(expect.arrayContaining([expect.objectContaining({ message: "Waiting 2 day(s)" })]));
});

it.each(["draft", "removed", "changed", "rescheduled", "disabled"])("stops obsolete requests (%s)", async (kind) => {
  const f = fixture(); await Followup.issuePlan("c1", "plan1", f.repos);
  if (kind === "draft") f.plans[0].prepared = true;
  if (kind === "removed") f.assignments.splice(0);
  if (kind === "changed") f.assignments[0].personId = "p2";
  if (kind === "rescheduled") f.plans[0].serviceDate = new Date(2030, 3, 14);
  if (kind === "disabled") f.workflows[0].active = false;
  await Followup.processPending(f.repos);
  expect(f.tasks[0].status).toBe("Closed"); expect(delivery).toHaveBeenCalledTimes(2);
});

it("leaves a due human exception when an unanswered request expires, without marking the role accepted", async () => {
  const f = fixture(); await Followup.issuePlan("c1", "plan1", f.repos);
  jest.setSystemTime(new Date("2030-04-08T01:00:00Z")); await Followup.processPending(f.repos); await Followup.processPending(f.repos);
  expect(delivery).toHaveBeenCalledTimes(2); expect(f.assignments[0].status).toBe("Unconfirmed");
  expect(f.tasks[0].status).toBe("Closed");
  expect(f.tasks[1]).toMatchObject({ taskType: "FollowUp", status: "Open", assignedToType: "group", assignedToId: "ministry1" });
  expect(f.tasks).toHaveLength(2);
});

it("records skipped/blocked delivery and retains the follow-up case", async () => {
  const f = fixture(); delivery.mockResolvedValue("blocked (no_provider)");
  await Followup.issuePlan("c1", "plan1", f.repos);
  expect(f.tasks[0].status).toBe("Open");
  expect(JSON.parse(f.tasks[0].data).history).toEqual(expect.arrayContaining([expect.objectContaining({ message: "Text: blocked (no_provider)" })]));
});

it("repairs a failure after durable issuance but before card creation", async () => {
  const f = fixture(); f.repos.task.save.mockRejectedValueOnce(new Error("transient DB failure"));
  await expect(Followup.issuePlan("c1", "plan1", f.repos)).rejects.toThrow("transient");
  expect(f.assignments[0].confirmationWorkflowId).toBe("wf1");
  await Followup.processPending(f.repos); expect(f.tasks).toHaveLength(1); expect(delivery).toHaveBeenCalledTimes(2);
});

it("does not replay an action after a crash with an uncertain provider result", async () => {
  const f = fixture();
  const save = f.repos.task.save.getMockImplementation();
  let failed = false;
  f.repos.task.save.mockImplementation(async (task: any) => {
    if (!failed && JSON.parse(task.data || "{}").actionAttempts?.action0 === "finished") { failed = true; throw new Error("crash after provider send"); }
    return save(task);
  });
  await expect(Followup.issuePlan("c1", "plan1", f.repos)).rejects.toThrow("crash");
  await Followup.processPending(f.repos);
  expect(delivery).toHaveBeenCalledTimes(2); // initial email once, then text once
  expect(JSON.parse(f.tasks[0].data).history).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining("outcome unknown") })]));
});

it("links human tasks to the request and closes them when the volunteer responds", async () => {
  const f = fixture(); f.actions.unshift({ id: "callTask", stepId: "s1", actionType: "createTask", config: JSON.stringify({ title: "Call volunteer", assignedToType: "person", assignedToId: "leader1", dueDays: 1 }) });
  await Followup.issuePlan("c1", "plan1", f.repos);
  expect(f.tasks[1]).toMatchObject({ taskType: "FollowUp", assignmentId: "a1", assignedToId: "leader1" });
  expect(new Date(f.tasks[1].dueDate).toISOString()).toBe("2030-04-02T12:00:00.000Z");
  f.assignments[0].status = "Accepted"; await Followup.reconcileAssignment("c1", "a1", f.repos);
  expect(f.tasks.every((t) => t.status === "Closed")).toBe(true);
});


it("blocks generic text/email actions on assignment-bound cards", async () => {
  const f = fixture();
  f.actions.unshift({ id: "genericText", stepId: "s1", actionType: "sendText", config: JSON.stringify({ message: "Generic shortcut" }) });
  f.actions.unshift({ id: "genericEmail", stepId: "s1", actionType: "sendEmail", config: JSON.stringify({ templateId: "template1" }) });
  await Followup.issuePlan("c1", "plan1", f.repos);
  const history = JSON.parse(f.tasks[0].data).history.map((h: any) => h.message);
  expect(history).toContain("Action sendText failed: Use a serving request message for assignment confirmation");
  expect(history).toContain("Action sendEmail failed: Use a serving request message for assignment confirmation");
  expect(delivery).toHaveBeenCalledTimes(2);
});

it("matches the assigned-volunteer UI's latest relevant boundary instead of the self-signup deadline", async () => {
  const f = fixture(); f.plans[0].signupDeadlineHours = 48; f.positions[0].categoryName = "Welcome";
  f.repos.time.loadByPlanId.mockResolvedValue([
    { teams: "Welcome", startTime: new Date("2030-04-07T09:00:00Z"), endTime: new Date("2030-04-07T11:00:00Z") },
    { teams: "Welcome", startTime: new Date("2030-04-07T12:00:00Z") },
    { teams: "Music", endTime: new Date("2030-04-07T15:00:00Z") }
  ]);
  expect((await Followup.followupDeadline("c1", f.plans[0], f.repos, f.positions[0])).toISOString()).toBe("2030-04-07T12:00:00.000Z");
  await Followup.issuePlan("c1", "plan1", f.repos);
  jest.setSystemTime(new Date("2030-04-07T11:59:00Z")); await Followup.reconcileAssignment("c1", "a1", f.repos);
  expect(f.tasks[0].status).toBe("Open");
  jest.setSystemTime(new Date("2030-04-07T12:00:00Z")); await Followup.processPending(f.repos);
  expect(f.tasks[0].status).toBe("Closed"); expect(f.tasks[1].status).toBe("Open"); expect(f.assignments[0].status).toBe("Unconfirmed");
});

it("uses an explicit end-of-service-day safety expiry when no relevant times exist", async () => {
  const f = fixture(); f.plans[0].signupDeadlineHours = 48;
  expect((await Followup.followupDeadline("c1", f.plans[0], f.repos, f.positions[0])).toISOString()).toBe("2030-04-08T00:00:00.000Z");
});


it("retains person-based routing for tailoring assignment follow-up", async () => {
  const f = fixture(); f.actions.splice(0);
  const { ConjunctionHelper } = jest.requireMock("../ConjunctionHelper.js");
  ConjunctionHelper.personMatchesStepRoute.mockResolvedValueOnce(true);
  f.repos.workflowStepRoute.loadForStep.mockImplementation(async (_c: string, step: string) => step === "s1" ? [{ id: "personRoute", trigger: "onEnter", kind: "personMatch", targetStepId: "s2" }] : []);
  await Followup.issuePlan("c1", "plan1", f.repos);
  expect(ConjunctionHelper.personMatchesStepRoute).toHaveBeenCalledWith("c1", "personRoute", "p1", f.repos);
  expect(f.tasks[0]).toMatchObject({ stepId: "s2", assignmentId: "a1", associatedWithType: "person", assignedToId: "leader1" });
});

it("wakes a human snooze without replaying outreach", async () => {
  const f = fixture(); await Followup.issuePlan("c1", "plan1", f.repos);
  jest.setSystemTime(new Date("2030-04-03T12:01:00Z")); await Followup.processPending(f.repos);
  jest.setSystemTime(new Date("2030-04-04T12:02:00Z")); await Followup.processPending(f.repos);
  await WorkflowHelper.snooze(structuredClone(f.tasks[0]), 1, f.repos);
  jest.setSystemTime(new Date("2030-04-05T12:03:00Z")); await Followup.processPending(f.repos);
  expect(f.tasks[0].snoozedUntil).toBeNull(); expect(f.tasks[0].stepId).toBe("s2"); expect(delivery).toHaveBeenCalledTimes(3);
  expect(JSON.parse(f.tasks[0].data).history.map((h: any) => h.message)).toContain("Snooze ended");
});


it("records call completion, skip and manual moves without dropping the unanswered owned case", async () => {
  const f = fixture(); await Followup.issuePlan("c1", "plan1", f.repos);
  jest.setSystemTime(new Date("2030-04-03T12:01:00Z")); await Followup.processPending(f.repos);
  jest.setSystemTime(new Date("2030-04-04T12:02:00Z")); await Followup.processPending(f.repos);
  const card = structuredClone(f.tasks[0]);
  await WorkflowHelper.moveRelative(card, 1, f.repos); // last-step skip stays tracked
  await WorkflowHelper.moveToStep(card, "s2", f.repos, true); // manual placement stays tracked
  await WorkflowHelper.complete(card, f.repos);
  expect(f.tasks[0]).toMatchObject({ status: "Open", assignedToId: "leader1", assignmentId: "a1" });
  expect(f.assignments[0].status).toBe("Unconfirmed");
  expect(JSON.parse(f.tasks[0].data).humanFollowupCompletedAt).toBeTruthy();
  expect(new Date(f.tasks[0].dueDate).toISOString()).toBe("2030-04-08T00:00:00.000Z");
  jest.setSystemTime(new Date("2030-04-08T00:00:00Z")); await Followup.processPending(f.repos);
  expect(f.tasks[0].status).toBe("Closed"); expect(f.tasks[1]).toMatchObject({ status: "Open", assignedToId: "leader1", taskType: "FollowUp" });
  expect(delivery).toHaveBeenCalledTimes(3);
});

it("still closes a completed human follow-up case when the volunteer accepts", async () => {
  const f = fixture(); await Followup.issuePlan("c1", "plan1", f.repos);
  await WorkflowHelper.complete(structuredClone(f.tasks[0]), f.repos);
  f.assignments[0].status = "Accepted"; await Followup.reconcileAssignment("c1", "a1", f.repos);
  expect(f.tasks[0].status).toBe("Closed"); expect(JSON.parse(f.tasks[0].data).assignmentOutcome).toBe("Accepted");
});
