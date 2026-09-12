import "reflect-metadata";

jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { tasks: { edit: "tasksEdit", view: "tasksView" } } }));
jest.mock("../../../../shared/events/InternalEventBus", () => ({ InternalEventBus: { publish: jest.fn() } }));
const prepareRequest = jest.fn();
jest.mock("../../helpers/index", () => ({
  WorkflowHelper: {},
  DirectoryUpdateHelper: { handleDirectoryUpdate: jest.fn() },
  AccountDeletionHelper: { taskType: "accountDeletion", prepareRequest: (...args: any[]) => prepareRequest.apply(null, args as any) }
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
    repos = { task: { save: jest.fn(async (t: any) => ({ ...t, id: t.id || "new" })), loadForAccountDeletion: jest.fn(async () => []) } };
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
});
