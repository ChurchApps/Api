import "reflect-metadata";

jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { tasks: { edit: "tasksEdit", view: "tasksView" }, people: { edit: "peopleEdit" } } }));
jest.mock("../../../../shared/events/InternalEventBus", () => ({ InternalEventBus: { publish: jest.fn() } }));
const prepareRequest = jest.fn();
const completeDecision = jest.fn();
const notifyReviewers = jest.fn();
jest.mock("../../helpers/index", () => ({
  WorkflowHelper: {},
  DirectoryUpdateHelper: { handleDirectoryUpdate: jest.fn() },
  AccountDeletionHelper: {
    taskType: "accountDeletion",
    prepareRequest: (...args: any[]) => prepareRequest.apply(null, args as any),
    completeDecision: (...args: any[]) => completeDecision.apply(null, args as any),
    notifyReviewers: (...args: any[]) => notifyReviewers.apply(null, args as any)
  }
}));

import { TaskController } from "../TaskController.js";

function makeController(access: string[], repos: any) {
  const controller = new TaskController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) =>
    action({ churchId: "c1", personId: "p1", firstName: "Donald", lastName: "Clark", checkAccess: (perm: any) => access.includes(perm) });
  return controller;
}

describe("TaskController.save accountDeletion self-service", () => {
  let repos: any;
  beforeEach(() => {
    prepareRequest.mockReset();
    completeDecision.mockReset();
    notifyReviewers.mockReset().mockResolvedValue(undefined);
    repos = { task: { save: jest.fn(async (t: any) => ({ ...t, id: t.id || "new" })), loadForAccountDeletion: jest.fn(async () => []), load: jest.fn() } };
  });

  it("still requires tasks edit for ordinary task creation", async () => {
    const result = await (makeController([], repos) as any).save({ query: {}, body: [{ title: "x" }] }, {});
    expect(result).toEqual({ obj: {}, status: 401 });
  });

  it("lets a member without tasks edit file their own deletion request", async () => {
    prepareRequest.mockResolvedValue({});
    const result = await (makeController([], repos) as any).save({ query: { type: "accountDeletion" }, body: [{ title: "x" }] }, {});
    expect(prepareRequest).toHaveBeenCalledTimes(1);
    expect(repos.task.save).toHaveBeenCalledTimes(1);
    expect(repos.task.save).toHaveBeenCalledWith(prepareRequest.mock.calls[0][1]);
    expect(notifyReviewers).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  it("returns the existing open request instead of filing a duplicate", async () => {
    repos.task.loadForAccountDeletion.mockResolvedValue([{ id: "open1", taskType: "accountDeletion", status: "Open" }]);
    const result = await (makeController([], repos) as any).save({ query: { type: "accountDeletion" }, body: [{ title: "x" }] }, {});
    expect(repos.task.loadForAccountDeletion).toHaveBeenCalledWith("c1", "p1");
    expect(prepareRequest).not.toHaveBeenCalled();
    expect(repos.task.save).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: "open1", taskType: "accountDeletion", status: "Open" }]);
  });

  it("rejects the request with 400 when no approval group is configured", async () => {
    prepareRequest.mockResolvedValue({ error: "No approval group configured" });
    const result = await (makeController([], repos) as any).save({ query: { type: "accountDeletion" }, body: [{ title: "x" }] }, {});
    expect(result.status).toBe(400);
    expect(repos.task.save).not.toHaveBeenCalled();
  });

  it("does not let staff close an account deletion request through the generic save", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", taskType: "accountDeletion", status: "Open" });
    const result = await (makeController(["tasksEdit"], repos) as any).save({ query: {}, body: [{ id: "t1", status: "Closed" }] }, {});
    expect(result.status).toBe(400);
    expect(repos.task.save).not.toHaveBeenCalled();
  });
});

describe("TaskController.accountDeletionDecision", () => {
  let repos: any;
  beforeEach(() => {
    completeDecision.mockReset();
    repos = { task: { load: jest.fn(), save: jest.fn() } };
  });

  it("requires People > Edit", async () => {
    const result = await (makeController([], repos) as any).accountDeletionDecision("t1", { body: { outcome: "approved" } }, {});
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(completeDecision).not.toHaveBeenCalled();
  });

  it("returns 404 when the task is not an open account deletion request", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", taskType: "directoryUpdate", status: "Open" });
    const result = await (makeController(["peopleEdit"], repos) as any).accountDeletionDecision("t1", { body: { outcome: "approved" } }, {});
    expect(result.status).toBe(404);
  });

  it("runs completeDecision and returns the closed task", async () => {
    const open = { id: "t1", taskType: "accountDeletion", status: "Open" };
    repos.task.load.mockResolvedValue(open);
    completeDecision.mockResolvedValue({ task: { ...open, status: "Closed" } });
    const result = await (makeController(["peopleEdit"], repos) as any).accountDeletionDecision("t1", { body: { outcome: "rejected", reason: "legal retention of donation records" } }, {});
    expect(completeDecision).toHaveBeenCalledWith(open, { outcome: "rejected", reason: "legal retention of donation records" }, repos);
    expect(result.status).toBe("Closed");
  });
});

describe("TaskController member directory updates and reads", () => {
  let repos: any;
  beforeEach(() => {
    repos = { task: { save: jest.fn(async (t: any) => ({ ...t, id: t.id || "new" })), load: jest.fn() } };
  });

  it("pins a member's directory update to their own person", async () => {
    await (makeController([], repos) as any).save({ query: { type: "directoryUpdate" }, body: [{ associatedWithType: "person", associatedWithId: "pVictim", status: "Closed", data: "[]" }] }, {});
    expect(repos.task.save).toHaveBeenCalledWith(expect.objectContaining({ associatedWithId: "p1", createdById: "p1", status: "Open" }));
  });

  it("401s a member directory update that targets an existing task", async () => {
    const result = await (makeController([], repos) as any).save({ query: { type: "directoryUpdate" }, body: [{ id: "t9", status: "Closed" }] }, {});
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(repos.task.save).not.toHaveBeenCalled();
  });

  it("401s reading someone else's task without tasks view", async () => {
    repos.task.load.mockResolvedValue({ id: "t1", associatedWithType: "person", associatedWithId: "p2", assignedToType: "group", assignedToId: "g9" });
    expect(await (makeController([], repos) as any).get("t1", {}, {})).toEqual({ obj: {}, status: 401 });
    expect(await (makeController(["tasksView"], repos) as any).get("t1", {}, {})).toEqual(expect.objectContaining({ id: "t1" }));
  });
});

describe("TaskController.save directoryUpdate identity", () => {
  it("rejects anonymous directory updates", async () => {
    const repos: any = { task: { save: jest.fn() } };
    const controller = new TaskController();
    (controller as any).repos = repos;
    (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "", personId: "", checkAccess: () => false });
    const result = await (controller as any).save({ query: { type: "directoryUpdate" }, body: [{ title: "x" }] }, {});
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(repos.task.save).not.toHaveBeenCalled();
  });
});

describe("TaskController.moveStep workflow scoping", () => {
  function setup(step: any) {
    const repos: any = {
      task: { load: jest.fn(async () => ({ id: "t1", churchId: "c1", workflowId: "w1", assignedToType: "person", assignedToId: "p1" })) },
      workflowStep: { load: jest.fn(async () => step) }
    };
    const controller: any = makeController(["tasksEdit"], repos);
    controller.canEditCard = () => true;
    controller.json = (obj: any, status: number) => ({ obj, status });
    return controller;
  }

  it("rejects moving a card to a step in another workflow", async () => {
    const result = await (setup({ id: "s9", workflowId: "w2" }) as any).moveStep("t1", { body: { stepId: "s9" } }, {});
    expect(result.status).toBe(400);
  });

  it("skips foreign-workflow steps in bulk moves", async () => {
    const result = await (setup({ id: "s9", workflowId: "w2" }) as any).bulkMoveStep({ body: { ids: ["t1"], stepId: "s9" } }, {});
    expect(result).toEqual({ updated: [], skipped: ["t1"] });
  });
});
