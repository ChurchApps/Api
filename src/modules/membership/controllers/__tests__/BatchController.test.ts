import "reflect-metadata";

jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { server: { admin: "serverAdmin" }, settings: { edit: "settingsEdit" } } }));
jest.mock("../../models/index", () => ({ Batch: class {} }));
const undoMock = jest.fn(async (..._args: unknown[]) => ({ restored: 2, skippedConflicts: [] as string[], failed: [] as string[], status: "undone" }));
jest.mock("../../../../shared/infrastructure/index", () => ({ BatchUndoHelper: { undo: (...a: unknown[]) => undoMock(...a) } }));

import express from "express";
import { BatchController } from "../BatchController.js";
import { Batch } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
type MakeOpts = { batch?: Batch; rows?: unknown[]; userId?: string; access?: string[] };

const req = { body: {} } as express.Request;
const res = {} as express.Response;

function make(opts: MakeOpts = {}) {
  const repos = {
    batch: {
      load: jest.fn(async () => opts.batch),
      setStatus: jest.fn(async () => {}),
      complete: jest.fn(async () => {}),
      create: jest.fn(async (b: Batch) => ({ ...b, id: "b1" }))
    },
    auditLog: { loadForBatch: jest.fn(async () => opts.rows ?? []) }
  };
  const au = { churchId: "ch1", id: opts.userId ?? "u1", checkAccess: (p: string) => (opts.access ?? []).includes(p) };
  const controller = new BatchController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

beforeEach(() => undoMock.mockClear());

describe("BatchController.undo permission + window", () => {
  it("refuses a non-creator, non-admin caller (401)", async () => {
    const { controller } = make({ batch: { id: "b1", churchId: "ch1", userId: "other", status: "completed", created: new Date() } });
    const result = (await controller.undo("b1", req, res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(undoMock).not.toHaveBeenCalled();
  });

  it("refuses when the batch is not completed (400)", async () => {
    const { controller } = make({ batch: { id: "b1", churchId: "ch1", userId: "u1", status: "open", created: new Date() } });
    const result = (await controller.undo("b1", req, res)) as JsonResult;
    expect(result.status).toBe(400);
    expect(undoMock).not.toHaveBeenCalled();
  });

  it("refuses when older than the 30-day window (400)", async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const { controller } = make({ batch: { id: "b1", churchId: "ch1", userId: "u1", status: "completed", created: old } });
    const result = (await controller.undo("b1", req, res)) as JsonResult;
    expect(result.status).toBe(400);
    expect(undoMock).not.toHaveBeenCalled();
  });

  it("runs the undo for the creator and stamps status", async () => {
    const { controller, repos } = make({ batch: { id: "b1", churchId: "ch1", userId: "u1", status: "completed", created: new Date() } });
    const result = (await controller.undo("b1", req, res)) as { restored: number };
    expect(undoMock).toHaveBeenCalled();
    expect(repos.batch.setStatus).toHaveBeenCalledWith("ch1", "b1", "undone", true);
    expect(result.restored).toBe(2);
  });

  it("runs the undo for a church admin who did not create the batch", async () => {
    const { controller } = make({ batch: { id: "b1", churchId: "ch1", userId: "other", status: "completed", created: new Date() }, userId: "admin", access: ["settingsEdit"] });
    await controller.undo("b1", req, res);
    expect(undoMock).toHaveBeenCalled();
  });
});

describe("BatchController.complete", () => {
  it("stamps itemCount from the batch's audit rows", async () => {
    const { controller, repos } = make({ batch: { id: "b1", churchId: "ch1", userId: "u1", status: "open", created: new Date() }, rows: [1, 2, 3] });
    await controller.complete("b1", req, res);
    expect(repos.batch.complete).toHaveBeenCalledWith("ch1", "b1", 3);
  });
});
