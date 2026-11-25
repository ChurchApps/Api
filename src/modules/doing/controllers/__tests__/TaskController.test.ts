const appendHistory = jest.fn();
jest.mock("../../helpers/StepActionHelper.js", () => ({ StepActionHelper: { appendHistory: (...args: unknown[]) => appendHistory.apply(null, args) } }));
jest.mock("../../helpers/AssignmentWorkflowHelper.js", () => ({ AssignmentWorkflowHelper: { workflowType: "assignmentConfirmation", issuePlan: jest.fn(), validateWorkflow: jest.fn(), stopIfResolved: jest.fn(async () => false) } }));
import "reflect-metadata";

jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { tasks: { edit: "tasksEdit", view: "tasksView" }, people: { edit: "peopleEdit" } } }));
jest.mock("../../../../shared/helpers/index", () => ({
  Permissions: { tasks: { edit: "tasksEdit", view: "tasksView" }, people: { edit: "peopleEdit" } },
  TaskAuth: jest.requireActual("../../../../shared/helpers/TaskAuth").TaskAuth
}));
jest.mock("../../../../shared/events/InternalEventBus", () => ({ InternalEventBus: { publish: jest.fn() } }));
const loadConversationMock = jest.fn();
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: jest.fn(), getMessagingModuleGateway: () => ({ loadConversation: loadConversationMock }) }));
const prepareRequest = jest.fn();
const completeDecision = jest.fn();
const notifyReviewers = jest.fn();
const prepareHouseholdEdit = jest.fn();
const snooze = jest.fn(async (task: Task, ..._rest: unknown[]) => task);
const reassign = jest.fn(async (task: Task, ..._rest: unknown[]) => task);
jest.mock("../../helpers/index", () => ({
  WorkflowHelper: { snooze: (...args: Parameters<typeof snooze>) => snooze.apply(null, args), reassign: (...args: Parameters<typeof reassign>) => reassign.apply(null, args) },
  DirectoryUpdateHelper: { handleDirectoryUpdate: jest.fn() },
  HouseholdEditHelper: { prepareRequest: (...args: unknown[]) => prepareHouseholdEdit.apply(null, args) },
  AccountDeletionHelper: {
    taskType: "accountDeletion",
    prepareRequest: (...args: unknown[]) => prepareRequest.apply(null, args),
    completeDecision: (...args: unknown[]) => completeDecision.apply(null, args),
    notifyReviewers: (...args: unknown[]) => notifyReviewers.apply(null, args)
  }
}));

import express from "express";
import { AuthenticatedUser, IPermission } from "@churchapps/apihelper";
import { TaskController } from "../TaskController.js";
import { Task, WorkflowStep } from "../../models/index.js";
import { Repos } from "../../repositories/index.js";

type MockRepos = Record<string, Record<string, jest.Mock>>;
type JsonOut = { obj: unknown; status: number };
const req = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

// Permissions are mocked as plain strings, so access holds those strings.
function makeController(access: unknown[], repos: MockRepos) {
  const controller = new TaskController();
  controller.repos = Object.assign({} as Repos, repos);
  controller.actionWrapper = async (_req, _res, action) =>
    action({ churchId: "c1", personId: "p1", firstName: "Donald", lastName: "Clark", checkAccess: (perm: IPermission) => access.includes(perm) } as AuthenticatedUser);
  return controller;
}

describe("TaskController.save accountDeletion self-service", () => {
  let repos: MockRepos;
  beforeEach(() => {
    prepareRequest.mockReset();
    completeDecision.mockReset();
    notifyReviewers.mockReset().mockResolvedValue(undefined);
    repos = { task: { save: jest.fn(async (t: Task) => ({ ...t, id: t.id || "new" })), loadForAccountDeletion: jest.fn(async (): Promise<Task[]> => []), load: jest.fn() } };
  });

  it("still requires tasks edit for ordinary task creation", async () => {
    const result = await makeController([], repos).save(req({ query: {}, body: [{ title: "x" }] }), res);
    expect(result).toEqual({ obj: {}, status: 401 });
  });

  it("lets a member without tasks edit file their own deletion request", async () => {
    prepareRequest.mockResolvedValue({});
    const result = await makeController([], repos).save(req({ query: { type: "accountDeletion" }, body: [{ title: "x" }] }), res);
    expect(prepareRequest).toHaveBeenCalledTimes(1);
    expect(repos.task.save).toHaveBeenCalledTimes(1);
    expect(repos.task.save).toHaveBeenCalledWith(prepareRequest.mock.calls[0][1]);
    expect(notifyReviewers).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  it("returns the existing open request instead of filing a duplicate", async () => {
    repos.task.loadForAccountDeletion.mockResolvedValue([{ id: "open1", taskType: "accountDeletion", status: "Open" }]);
    const result = await makeController([], repos).save(req({ query: { type: "accountDeletion" }, body: [{ title: "x" }] }), res);
    expect(repos.task.loadForAccountDeletion).toHaveBeenCalledWith("c1", "p1");
    expect(prepareRequest).not.toHaveBeenCalled();
    expect(repos.task.save).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: "open1", taskType: "accountDeletion", status: "Open" }]);
  });

  it("rejects the request with 400 when no approval group is configured", async () => {
    prepareRequest.mockResolvedValue({ error: "No approval group configured" });
    const result = (await makeController([], repos).save(req({ query: { type: "accountDeletion" }, body: [{ title: "x" }] }), res)) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.task.save).not.toHaveBeenCalled();
  });

  it("does not let staff close an account deletion request through the generic save", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", taskType: "accountDeletion", status: "Open" });
    const result = (await makeController(["tasksEdit"], repos).save(req({ query: {}, body: [{ id: "t1", status: "Closed" }] }), res)) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.task.save).not.toHaveBeenCalled();
  });
});

describe("TaskController.accountDeletionDecision", () => {
  let repos: MockRepos;
  beforeEach(() => {
    completeDecision.mockReset();
    repos = { task: { load: jest.fn(), save: jest.fn() } };
  });

  it("requires People > Edit", async () => {
    const result = await makeController([], repos).accountDeletionDecision("t1", req({ body: { outcome: "approved" } }), res);
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(completeDecision).not.toHaveBeenCalled();
  });

  it("returns 404 when the task is not an open account deletion request", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", taskType: "directoryUpdate", status: "Open" });
    const result = (await makeController(["peopleEdit"], repos).accountDeletionDecision("t1", req({ body: { outcome: "approved" } }), res)) as JsonOut;
    expect(result.status).toBe(404);
  });

  it("runs completeDecision and returns the closed task", async () => {
    const open = { id: "t1", taskType: "accountDeletion", status: "Open" };
    repos.task.load.mockResolvedValue(open);
    completeDecision.mockResolvedValue({ task: { ...open, status: "Closed" } });
    const result = (await makeController(["peopleEdit"], repos).accountDeletionDecision("t1", req({ body: { outcome: "rejected", reason: "legal retention of donation records" } }), res)) as Task;
    expect(completeDecision).toHaveBeenCalledWith(open, { outcome: "rejected", reason: "legal retention of donation records" }, repos);
    expect(result.status).toBe("Closed");
  });
});

describe("TaskController member directory updates and reads", () => {
  let repos: MockRepos;
  beforeEach(() => {
    repos = { task: { save: jest.fn(async (t: Task) => ({ ...t, id: t.id || "new" })), load: jest.fn() } };
  });

  it("pins a member's directory update to their own person", async () => {
    await makeController([], repos).save(req({ query: { type: "directoryUpdate" }, body: [{ associatedWithType: "person", status: "Closed", data: "[]" }] }), res);
    expect(repos.task.save).toHaveBeenCalledWith(expect.objectContaining({ associatedWithId: "p1", createdById: "p1", status: "Open" }));
  });

  it("sends a request about someone else through the household edit checks", async () => {
    prepareHouseholdEdit.mockReset().mockImplementation(async (_au: unknown, task: Task) => { Object.assign(task, { status: "Open", createdById: "p1", assignedToType: "group", assignedToId: "gApprovers" }); return {}; });
    await makeController([], repos).save(req({ query: { type: "directoryUpdate" }, body: [{ associatedWithType: "person", associatedWithId: "pChild", status: "Closed", data: "[]" }] }), res);
    expect(prepareHouseholdEdit).toHaveBeenCalledTimes(1);
    expect(repos.task.save).toHaveBeenCalledWith(expect.objectContaining({ associatedWithId: "pChild", createdById: "p1", status: "Open", assignedToId: "gApprovers" }));
  });

  it("saves nothing when the household edit checks refuse", async () => {
    prepareHouseholdEdit.mockReset().mockResolvedValue({ status: 401 });
    const result = await makeController([], repos).save(req({ query: { type: "directoryUpdate" }, body: [{ associatedWithType: "person", associatedWithId: "p1", data: "[]" }, { associatedWithType: "person", associatedWithId: "pVictim", data: "[]" }] }), res);
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(repos.task.save).not.toHaveBeenCalled();
  });

  it("returns the household edit error message", async () => {
    prepareHouseholdEdit.mockReset().mockResolvedValue({ status: 400, error: "no approval group" });
    const result = await makeController([], repos).save(req({ query: { type: "directoryUpdate" }, body: [{ associatedWithId: "pChild", data: "[]" }] }), res);
    expect(result).toEqual({ obj: { message: "no approval group" }, status: 400 });
    expect(repos.task.save).not.toHaveBeenCalled();
  });

  it("401s a member directory update that targets an existing task", async () => {
    const result = await makeController([], repos).save(req({ query: { type: "directoryUpdate" }, body: [{ id: "t9", status: "Closed" }] }), res);
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(repos.task.save).not.toHaveBeenCalled();
  });

  it("401s reading someone else's task without tasks view", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", associatedWithType: "person", associatedWithId: "p2", assignedToType: "group", assignedToId: "g9" });
    expect(await makeController([], repos).get("t1", req({}), res)).toEqual({ obj: {}, status: 401 });
    expect(await makeController(["tasksView"], repos).get("t1", req({}), res)).toEqual(expect.objectContaining({ id: "t1" }));
  });
});

describe("TaskController.save directoryUpdate identity", () => {
  it("rejects anonymous directory updates", async () => {
    const repos: MockRepos = { task: { save: jest.fn() } };
    const controller = new TaskController();
    controller.repos = Object.assign({} as Repos, repos);
    controller.actionWrapper = async (_req, _res, action) => action({ churchId: "", personId: "", checkAccess: (_perm: IPermission): boolean => false } as AuthenticatedUser);
    const result = await controller.save(req({ query: { type: "directoryUpdate" }, body: [{ title: "x" }] }), res);
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(repos.task.save).not.toHaveBeenCalled();
  });
});

describe("TaskController.moveStep workflow scoping", () => {
  function setup(step: Partial<WorkflowStep>) {
    const repos: MockRepos = {
      task: { load: jest.fn(async () => ({ id: "t1", churchId: "c1", workflowId: "w1", assignedToType: "person", assignedToId: "p1" })) },
      workflowStep: { load: jest.fn(async () => step) }
    };
    const controller = makeController(["tasksEdit"], repos);
    controller.canEditCard = () => true;
    return controller;
  }

  it("rejects moving a card to a step in another workflow", async () => {
    const result = (await setup({ id: "s9", workflowId: "w2" }).moveStep("t1", req({ body: { stepId: "s9" } }), res)) as JsonOut;
    expect(result.status).toBe(400);
  });

  it("skips foreign-workflow steps in bulk moves", async () => {
    const result = await setup({ id: "s9", workflowId: "w2" }).bulkMoveStep(req({ body: { ids: ["t1"], stepId: "s9" } }), res);
    expect(result).toEqual({ updated: [], skipped: ["t1"] });
  });
});

describe("TaskController card snooze and reassign", () => {
  function setup() {
    snooze.mockClear();
    reassign.mockClear();
    const repos: MockRepos = { task: { load: jest.fn(async () => ({ id: "t1", churchId: "c1", workflowId: "w1" })) } };
    const controller = makeController(["tasksEdit"], repos);
    controller.canEditCard = () => true;
    // json is protected on the real base class, so set it as a plain property.
    Object.assign(controller, { json: (obj: unknown, status: number) => ({ obj, status }) });
    return controller;
  }

  it("snoozes until a picked date", async () => {
    await setup().snooze("t1", req({ body: { until: "2099-01-05T06:00:00.000Z" } }), res);
    expect(snooze.mock.calls[0][1]).toEqual(new Date("2099-01-05T06:00:00.000Z"));
  });

  it("still snoozes for a number of days", async () => {
    await setup().snooze("t1", req({ body: { days: 3 } }), res);
    expect(snooze.mock.calls[0][1]).toBe(3);
  });

  it("rejects a date in the past", async () => {
    const result = (await setup().snooze("t1", req({ body: { until: "2001-01-01T00:00:00.000Z" } }), res)) as JsonOut;
    expect(result.status).toBe(400);
    expect(snooze).not.toHaveBeenCalled();
  });

  it("passes the signed-in person to reassign", async () => {
    await setup().reassign("t1", req({ body: { assignedToType: "person", assignedToId: "p1", assignedToLabel: "Donald Clark" } }), res);
    expect(reassign.mock.calls[0][3]).toBe("p1");
  });
});

describe("TaskController.setConversation", () => {
  beforeEach(() => {
    loadConversationMock.mockReset();
    loadConversationMock.mockImplementation(async (churchId: string, id: string) => (churchId === "c1" && id === "conv1" ? { id: "conv1", churchId: "c1", contentType: "workflowCard", contentId: "t1" } : null));
  });

  function setup(task: Partial<Task>, canEdit = true) {
    const repos: MockRepos = { task: { load: jest.fn(async () => task), save: jest.fn(async (t: Task) => ({ ...t })) } };
    const controller = makeController([], repos);
    controller.canEditCard = () => canEdit;
    return { controller, repos };
  }

  it("links a new conversation to a workflow card", async () => {
    const { controller, repos } = setup({ id: "t1", churchId: "c1", workflowId: "w1", stepId: "s1" });
    const result = (await controller.setConversation("t1", req({ body: { conversationId: "conv1" } }), res)) as Task;
    expect(repos.task.save).toHaveBeenCalledWith(expect.objectContaining({ id: "t1", conversationId: "conv1" }));
    expect(result.conversationId).toBe("conv1");
  });

  it("refuses a conversation that is not this card's notes", async () => {
    loadConversationMock.mockImplementation(async () => ({ id: "conv2", churchId: "c1", contentType: "group", contentId: "g1" }));
    const { controller, repos } = setup({ id: "t1", churchId: "c1", workflowId: "w1", stepId: "s1" });
    const result = (await controller.setConversation("t1", req({ body: { conversationId: "conv2" } }), res)) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.task.save).not.toHaveBeenCalled();
  });

  it("refuses another card's notes conversation", async () => {
    loadConversationMock.mockImplementation(async () => ({ id: "conv3", churchId: "c1", contentType: "workflowCard", contentId: "t2" }));
    const { controller, repos } = setup({ id: "t1", churchId: "c1", workflowId: "w1", stepId: "s1" });
    const result = (await controller.setConversation("t1", req({ body: { conversationId: "conv3" } }), res)) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.task.save).not.toHaveBeenCalled();
  });

  it("keeps the card's existing conversation", async () => {
    const { controller, repos } = setup({ id: "t1", churchId: "c1", workflowId: "w1", stepId: "s1", conversationId: "conv0" });
    const result = (await controller.setConversation("t1", req({ body: { conversationId: "conv1" } }), res)) as Task;
    expect(repos.task.save).not.toHaveBeenCalled();
    expect(result.conversationId).toBe("conv0");
  });

  it("401s someone who cannot edit the card", async () => {
    const { controller, repos } = setup({ id: "t1", churchId: "c1", workflowId: "w1", stepId: "s1" }, false);
    const result = await controller.setConversation("t1", req({ body: { conversationId: "conv1" } }), res);
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(repos.task.save).not.toHaveBeenCalled();
  });
});

// Issue #1227: the person assigned a workflow card needs the phone and email of the
// person the card is about, even without People access.
describe("TaskController.getContact", () => {
  const { getMembershipModuleGateway } = jest.requireMock("../../../../shared/modules/index");
  let repos: MockRepos;
  let loadPerson: jest.Mock;
  const card = { id: "t1", associatedWithType: "person", associatedWithId: "per9", assignedToType: "person", assignedToId: "p1", createdByType: "person", createdById: "p5" };

  beforeEach(() => {
    loadPerson = jest.fn(async () => ({ id: "per9", householdId: "h1", displayName: "Isaac Turner", firstName: "Isaac", mobilePhone: "555-0101", email: "isaac@example.com", birthDate: new Date("1990-01-01"), membershipStatus: "Guest" }));
    getMembershipModuleGateway.mockReturnValue({ loadPerson });
    repos = { task: { load: jest.fn(async () => card) } };
  });

  it("returns only the contact fields to the assignee without tasks view", async () => {
    const result = await makeController([], repos).getContact("t1", req({}), res);
    expect(loadPerson).toHaveBeenCalledWith("c1", "per9");
    expect(result).toEqual({ personId: "per9", displayName: "Isaac Turner", mobilePhone: "555-0101", email: "isaac@example.com" });
  });

  it("rejects an unrelated user without tasks view", async () => {
    repos.task.load.mockResolvedValue({ ...card, assignedToId: "p7" });
    const result = await makeController([], repos).getContact("t1", req({}), res);
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(loadPerson).not.toHaveBeenCalled();
  });

  it("returns nothing for a card that is not about a person", async () => {
    repos.task.load.mockResolvedValue({ ...card, associatedWithType: "group", associatedWithId: "g1" });
    const result = await makeController([], repos).getContact("t1", req({}), res);
    expect(result).toEqual({});
    expect(loadPerson).not.toHaveBeenCalled();
  });

  it("returns the contact to a tasks view user", async () => {
    repos.task.load.mockResolvedValue({ ...card, assignedToId: "p7" });
    const result = await makeController(["tasksView"], repos).getContact("t1", req({}), res);
    expect(result).toEqual({ personId: "per9", displayName: "Isaac Turner", mobilePhone: "555-0101", email: "isaac@example.com" });
  });
});

describe("TaskController.save reassignment history", () => {
  let repos: MockRepos;
  beforeEach(() => {
    appendHistory.mockReset();
    repos = { task: { save: jest.fn(async (t: Task) => t), load: jest.fn(async (): Promise<Task> => ({ id: "t1", title: "Call", assignedToType: "person", assignedToId: "p1", assignedToLabel: "Donald Clark", data: null })) } };
  });

  it("records a reassignment of a plain task", async () => {
    await makeController(["tasksEdit"], repos).save(req({ query: {}, body: [{ id: "t1", title: "Call", assignedToType: "person", assignedToId: "p2", assignedToLabel: "Carol Clark" }] }), res);
    expect(appendHistory).toHaveBeenCalledTimes(1);
    expect(appendHistory.mock.calls[0][1]).toBe("Reassigned from Donald Clark to Carol Clark");
    expect(repos.task.save).toHaveBeenCalledTimes(1);
  });

  it("adds nothing when the assignee is unchanged", async () => {
    await makeController(["tasksEdit"], repos).save(req({ query: {}, body: [{ id: "t1", title: "Renamed", assignedToType: "person", assignedToId: "p1", assignedToLabel: "Donald Clark" }] }), res);
    expect(appendHistory).not.toHaveBeenCalled();
  });

  it("keeps the stored history when the client sends no data", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", assignedToId: "p1", assignedToLabel: "Donald Clark", data: JSON.stringify({ history: [] }) });
    await makeController(["tasksEdit"], repos).save(req({ query: {}, body: [{ id: "t1", assignedToId: "p2", assignedToLabel: "Carol Clark" }] }), res);
    expect(appendHistory.mock.calls[0][0].data).toBe(JSON.stringify({ history: [] }));
  });
});

describe("TaskController.save reopen", () => {
  const closedAt = new Date("2026-11-21T09:14:00Z");
  let repos: MockRepos;
  beforeEach(() => {
    repos = {
      task: {
        save: jest.fn(async (t: Task) => t),
        load: jest.fn(async () => ({ id: "t1", title: "Call", status: "Closed", dateClosed: closedAt })),
        loadByFollowupKey: jest.fn(async (): Promise<Task> => null),
        withAssignmentLock: jest.fn(async (_c: string, _a: string, fn: () => unknown) => fn())
      }
    };
  });

  it("clears the closed date when a plain task is reopened", async () => {
    await makeController(["tasksEdit"], repos).save(req({ query: {}, body: [{ id: "t1", title: "Call", status: "Open" }] }), res);
    expect(repos.task.save.mock.calls[0][0].dateClosed).toBeNull();
  });

  it("clears the closed date when a serving follow-up is reopened", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", title: "Call", status: "Closed", dateClosed: closedAt, assignmentId: "a1" });
    await makeController(["tasksEdit"], repos).save(req({ query: {}, body: [{ id: "t1", title: "Call", status: "Open" }] }), res);
    expect(repos.task.save.mock.calls[0][0].dateClosed).toBeNull();
  });

  it("keeps the original close time when a closed serving follow-up is edited", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", title: "Call", status: "Closed", dateClosed: closedAt, assignmentId: "a1" });
    await makeController(["tasksEdit"], repos).save(req({ query: {}, body: [{ id: "t1", title: "Renamed", status: "Closed" }] }), res);
    expect(repos.task.save.mock.calls[0][0].dateClosed).toBe(closedAt);
  });

  it("stamps a close date when an open task is closed", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", title: "Call", status: "Open", dateClosed: null });
    await makeController(["tasksEdit"], repos).save(req({ query: {}, body: [{ id: "t1", title: "Call", status: "Closed" }] }), res);
    expect(repos.task.save.mock.calls[0][0].dateClosed).toBeInstanceOf(Date);
  });
});

describe("TaskController.delete", () => {
  let repos: MockRepos;
  beforeEach(() => {
    repos = { task: { load: jest.fn(async () => ({ id: "t1", churchId: "c1", title: "Call", status: "Closed" })), delete: jest.fn(async (): Promise<void> => undefined) } };
  });

  it("requires tasks edit", async () => {
    const result = await makeController(["tasksView"], repos).delete("t1", req({}), res);
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(repos.task.delete).not.toHaveBeenCalled();
  });

  it("deletes an open or closed plain task", async () => {
    const result = await makeController(["tasksEdit"], repos).delete("t1", req({}), res);
    expect(repos.task.delete).toHaveBeenCalledWith("c1", "t1");
    expect(result).toEqual({});
  });

  it("returns 404 for a missing task", async () => {
    repos.task.load.mockResolvedValue(null);
    const result = (await makeController(["tasksEdit"], repos).delete("t1", req({}), res)) as JsonOut;
    expect(result.status).toBe(404);
    expect(repos.task.delete).not.toHaveBeenCalled();
  });

  it("refuses account deletion requests", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", taskType: "accountDeletion", status: "Open" });
    const result = (await makeController(["tasksEdit"], repos).delete("t1", req({}), res)) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.task.delete).not.toHaveBeenCalled();
  });

  it("refuses workflow cards, which use remove", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", workflowId: "w1", status: "Open" });
    const result = (await makeController(["tasksEdit"], repos).delete("t1", req({}), res)) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.task.delete).not.toHaveBeenCalled();
  });
});
