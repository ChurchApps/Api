import "reflect-metadata";

jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { server: { admin: "serverAdmin" }, settings: { edit: "settingsEdit" } } }));
jest.mock("../../models/index", () => ({ Batch: class {} }));
const undoMock = jest.fn(async () => ({ restored: 2, skippedConflicts: [], failed: [], status: "undone" }));
jest.mock("../../../../shared/infrastructure/index", () => ({ BatchUndoHelper: { undo: (...a: any[]) => undoMock(...a) } }));

import { BatchController } from "../BatchController.js";

function make(opts: any = {}) {
  const repos: any = {
    batch: {
      load: jest.fn(async () => opts.batch),
      setStatus: jest.fn(async () => {}),
      complete: jest.fn(async () => {}),
      create: jest.fn(async (b: any) => ({ ...b, id: "b1" }))
    },
    auditLog: { loadForBatch: jest.fn(async () => opts.rows ?? []) }
  };
  const au = { churchId: "ch1", id: opts.userId ?? "u1", checkAccess: (p: any) => (opts.access ?? []).includes(p) };
  const controller = new BatchController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

beforeEach(() => undoMock.mockClear());

describe("BatchController.undo permission + window", () => {
  it("refuses a non-creator, non-admin caller (401)", async () => {
    const { controller } = make({ batch: { id: "b1", churchId: "ch1", userId: "other", status: "completed", created: new Date() } });
    const result = await (controller as any).undo("b1", { body: {} }, {});
    expect(result.status).toBe(401);
    expect(undoMock).not.toHaveBeenCalled();
  });

  it("refuses when the batch is not completed (400)", async () => {
    const { controller } = make({ batch: { id: "b1", churchId: "ch1", userId: "u1", status: "open", created: new Date() } });
    const result = await (controller as any).undo("b1", { body: {} }, {});
    expect(result.status).toBe(400);
    expect(undoMock).not.toHaveBeenCalled();
  });

  it("refuses when older than the 30-day window (400)", async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const { controller } = make({ batch: { id: "b1", churchId: "ch1", userId: "u1", status: "completed", created: old } });
    const result = await (controller as any).undo("b1", { body: {} }, {});
    expect(result.status).toBe(400);
    expect(undoMock).not.toHaveBeenCalled();
  });

  it("runs the undo for the creator and stamps status", async () => {
    const { controller, repos } = make({ batch: { id: "b1", churchId: "ch1", userId: "u1", status: "completed", created: new Date() } });
    const result = await (controller as any).undo("b1", { body: {} }, {});
    expect(undoMock).toHaveBeenCalled();
    expect(repos.batch.setStatus).toHaveBeenCalledWith("ch1", "b1", "undone", true);
    expect(result.restored).toBe(2);
  });

  it("runs the undo for a church admin who did not create the batch", async () => {
    const { controller } = make({ batch: { id: "b1", churchId: "ch1", userId: "other", status: "completed", created: new Date() }, userId: "admin", access: ["settingsEdit"] });
    await (controller as any).undo("b1", { body: {} }, {});
    expect(undoMock).toHaveBeenCalled();
  });
});

describe("BatchController.complete", () => {
  it("stamps itemCount from the batch's audit rows", async () => {
    const { controller, repos } = make({ batch: { id: "b1", churchId: "ch1", userId: "u1", status: "open", created: new Date() }, rows: [1, 2, 3] });
    await (controller as any).complete("b1", { body: {} }, {});
    expect(repos.batch.complete).toHaveBeenCalledWith("ch1", "b1", 3);
  });
});
