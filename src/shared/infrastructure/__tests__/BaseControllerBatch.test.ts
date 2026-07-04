// Verifies X-Batch-Id (explicit batch) handling and implicit bulk batches in actionWrapper.

jest.mock("@churchapps/apihelper", () => ({
  CustomBaseController: class {
    protected _au: any;
    async actionWrapper(_req: any, _res: any, fn: (au: any) => Promise<any>) { return fn(this._au); }
    async actionWrapperAnon(_req: any, _res: any, fn: () => Promise<any>) { return fn(); }
    json(obj: any, statusCode: number) { return { json: obj, statusCode }; }
  },
  AuthenticatedUser: class {}
}));

let dbRows: any[] = [];
let dbThrows = false;
function chain(): any {
  const c: any = {
    selectAll: () => c,
    select: () => c,
    set: () => c,
    values: () => c,
    where: () => c,
    execute: async () => { if (dbThrows) throw new Error("snapshot fail"); return dbRows; },
    executeTakeFirst: async () => { if (dbThrows) throw new Error("snapshot fail"); return dbRows[0]; }
  };
  return c;
}
jest.mock("../KyselyPool.js", () => ({ KyselyPool: { getDb: () => ({ selectFrom: chain, deleteFrom: chain, updateTable: chain, insertInto: chain }) } }));

let batchRecord: any = null;
jest.mock("../RepoManager.js", () => ({
  RepoManager: {
    getRepos: async () => ({
      auditLog: { create: async (log: any) => { ((globalThis as any).__sink ||= []).push(log); return log; } },
      batch: { load: async () => batchRecord }
    })
  }
}));

import { BaseController } from "../BaseController.js";

function sink(): any[] { return (globalThis as any).__sink; }

function makeController(moduleName: string, au: any) {
  class TestController extends BaseController {
    constructor() { super(moduleName); (this as any)._au = au; }
  }
  return new TestController();
}

const au = { churchId: "ch1", id: "u1" };
const baseReq = { headers: {}, socket: {}, params: {}, query: {} } as any;

beforeEach(() => {
  (globalThis as any).__sink = [];
  dbRows = [];
  dbThrows = false;
  batchRecord = null;
});

describe("actionWrapper explicit batch (X-Batch-Id)", () => {
  it("snapshots before-images and tags the audit row with batchId + before/after", async () => {
    batchRecord = { id: "b1", churchId: "ch1", status: "open" };
    dbRows = [{ id: "p1", churchId: "ch1", firstName: "Old" }];
    const ctrl = makeController("membership", au);
    const req = { ...baseReq, method: "POST", baseUrl: "/membership/people", path: "/", route: { path: "/" }, headers: { "x-batch-id": "b1" }, body: [{ id: "p1", firstName: "New" }] };
    let ran = false;
    await ctrl.actionWrapper(req, {} as any, async () => { ran = true; return [{ id: "p1" }]; });

    expect(ran).toBe(true);
    expect(sink()).toHaveLength(1);
    expect(sink()[0].batchId).toBe("b1");
    const details = JSON.parse(sink()[0].details);
    expect(details.op).toBe("update");
    expect(details.before.firstName).toBe("Old");
    expect(details.after.firstName).toBe("New");
  });

  it("marks a row absent from the snapshot as a create", async () => {
    batchRecord = { id: "b1", churchId: "ch1", status: "open" };
    dbRows = [];
    const ctrl = makeController("membership", au);
    const req = { ...baseReq, method: "POST", baseUrl: "/membership/people", path: "/", route: { path: "/" }, headers: { "x-batch-id": "b1" }, body: [{ firstName: "New" }] };
    await ctrl.actionWrapper(req, {} as any, async () => [{ id: "pNew" }]);

    expect(sink()).toHaveLength(1);
    const details = JSON.parse(sink()[0].details);
    expect(details.op).toBe("create");
    expect(details.before).toBeNull();
  });

  it("returns 403 and does not run the action for a closed/invalid batch", async () => {
    batchRecord = { id: "b1", churchId: "ch1", status: "completed" };
    const ctrl = makeController("membership", au);
    const req = { ...baseReq, method: "POST", baseUrl: "/membership/people", path: "/", route: { path: "/" }, headers: { "x-batch-id": "b1" }, body: [{ id: "p1" }] };
    let ran = false;
    const result = await ctrl.actionWrapper(req, {} as any, async () => { ran = true; return [{ id: "p1" }]; });

    expect(ran).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(sink()).toHaveLength(0);
  });

  it("returns 400 for a batch-mode request on a route with no dbModule/table", async () => {
    batchRecord = { id: "b1", churchId: "ch1", status: "open" };
    const ctrl = makeController("doing", au);
    const req = { ...baseReq, method: "POST", baseUrl: "/doing/tasks", path: "/", route: { path: "/" }, headers: { "x-batch-id": "b1" }, body: [{ id: "t1" }] };
    let ran = false;
    const result = await ctrl.actionWrapper(req, {} as any, async () => { ran = true; return [{ id: "t1" }]; });

    expect(ran).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it("fails the request (500) with no writes when the snapshot read fails", async () => {
    batchRecord = { id: "b1", churchId: "ch1", status: "open" };
    dbThrows = true;
    const ctrl = makeController("membership", au);
    const req = { ...baseReq, method: "POST", baseUrl: "/membership/people", path: "/", route: { path: "/" }, headers: { "x-batch-id": "b1" }, body: [{ id: "p1", firstName: "New" }] };
    let ran = false;
    const result = await ctrl.actionWrapper(req, {} as any, async () => { ran = true; return [{ id: "p1" }]; });

    expect(ran).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(sink()).toHaveLength(0);
  });
});

describe("actionWrapper implicit bulk batch", () => {
  it("tags bulk audit rows with the batchId returned in the payload and captures before-images", async () => {
    dbRows = [{ id: "p1", churchId: "ch1", firstName: "A" }, { id: "p2", churchId: "ch1", firstName: "B" }];
    const ctrl = makeController("membership", au);
    const req = { ...baseReq, method: "POST", baseUrl: "/membership/people", path: "/bulk-delete", route: { path: "/bulk-delete" }, body: { personIds: ["p1", "p2"] } };
    await ctrl.actionWrapper(req, {} as any, async () => ({ json: { success: true, deletedIds: ["p1", "p2"], count: 2, batchId: "b9" }, statusCode: 200 }));

    expect(sink()).toHaveLength(2);
    expect(sink().every((c) => c.batchId === "b9")).toBe(true);
    const first = JSON.parse(sink()[0].details);
    expect(first.before.firstName).toBe("A");
  });
});

describe("resolveUndoConfig registry coverage", () => {
  it("resolves the import-target entries added for B1Transfer", async () => {
    expect(BaseController.resolveUndoConfig("membership", "household")).toMatchObject({ dbModule: "membership", table: "households" });
    expect(BaseController.resolveUndoConfig("attendance", "serviceTime")).toMatchObject({ dbModule: "attendance", table: "serviceTimes" });
    expect(BaseController.resolveUndoConfig("giving", "fundDonation")).toMatchObject({ dbModule: "giving", table: "fundDonations" });
    expect(BaseController.resolveUndoConfig("giving", "donationBatch")).toMatchObject({ dbModule: "giving", table: "donationBatches" });
  });

  it("does not resolve opt-out or unregistered entity types", async () => {
    expect(BaseController.resolveUndoConfig("attendance", "visit")).toBeUndefined();
    expect(BaseController.resolveUndoConfig("doing", "task")).toBeUndefined();
  });
});
