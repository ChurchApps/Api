import "reflect-metadata";
import type express from "express";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e", view: "v" } } }));

import { HeadcountController } from "../HeadcountController.js";
import type { Headcount } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
const asReq = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

function makeController(access: (perm: string) => boolean = () => true) {
  const repos = {
    headcount: {
      convertAllToModel: (_c: string, rows: Headcount[]) => rows,
      convertToModel: (_c: string, row: Headcount) => row,
      save: jest.fn(async (h: Headcount) => { if (!h.id) h.id = "hc1"; return h; }),
      delete: jest.fn(),
      load: jest.fn(async (): Promise<Headcount> => ({ id: "hc1", value: 5 })),
      loadAll: jest.fn(async (): Promise<Headcount[]> => [{ id: "hc1", value: 5 }]),
      loadByServiceTimeId: jest.fn(async (): Promise<Headcount[]> => []),
      loadByGroupId: jest.fn(async (): Promise<Headcount[]> => [])
    }
  };
  const au = { churchId: "c1", id: "u1", personId: "p1", checkAccess: access };
  const controller = Object.assign(new HeadcountController(), {
    repos,
    actionWrapper: (_req: unknown, _res: unknown, action: (user: typeof au) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("HeadcountController.save", () => {
  it("stamps churchId and enteredBy on new rows and coerces value to a number", async () => {
    const { controller, repos } = makeController();
    const result = (await controller.save(asReq({ body: [{ serviceTimeId: "st1", headcountDate: "2026-09-06", value: "120" }] }), res)) as Headcount[];
    expect(repos.headcount.save).toHaveBeenCalledTimes(1);
    const saved = repos.headcount.save.mock.calls[0][0];
    expect(saved.churchId).toBe("c1");
    expect(saved.enteredBy).toBe("p1");
    expect(saved.value).toBe(120);
    expect(result[0].id).toBe("hc1");
  });

  it("does not overwrite enteredBy when updating an existing row", async () => {
    const { controller, repos } = makeController();
    await controller.save(asReq({ body: [{ id: "hc9", serviceTimeId: "st1", headcountDate: "2026-09-06", value: 80, enteredBy: "orig" }] }), res);
    expect(repos.headcount.save.mock.calls[0][0].enteredBy).toBe("orig");
  });

  it("rejects negative and non-integer values with 400 and saves nothing", async () => {
    const { controller, repos } = makeController();
    const neg = (await controller.save(asReq({ body: [{ serviceTimeId: "st1", headcountDate: "2026-09-06", value: -1 }] }), res)) as JsonResult;
    const frac = (await controller.save(asReq({ body: [{ serviceTimeId: "st1", headcountDate: "2026-09-06", value: 1.5 }] }), res)) as JsonResult;
    const text = (await controller.save(asReq({ body: [{ serviceTimeId: "st1", headcountDate: "2026-09-06", value: "lots" }] }), res)) as JsonResult;
    expect(neg.status).toBe(400);
    expect(frac.status).toBe(400);
    expect(text.status).toBe(400);
    expect(repos.headcount.save).not.toHaveBeenCalled();
  });

  it("requires a date and at least one of service, service time or group", async () => {
    const { controller, repos } = makeController();
    const noDate = (await controller.save(asReq({ body: [{ serviceTimeId: "st1", value: 10 }] }), res)) as JsonResult;
    const noTarget = (await controller.save(asReq({ body: [{ headcountDate: "2026-09-06", value: 10 }] }), res)) as JsonResult;
    expect(noDate.status).toBe(400);
    expect(noTarget.status).toBe(400);
    expect(repos.headcount.save).not.toHaveBeenCalled();
  });

  it("returns 401 without attendance edit permission", async () => {
    const { controller, repos } = makeController((perm) => perm !== "e");
    const result = (await controller.save(asReq({ body: [{ serviceTimeId: "st1", headcountDate: "2026-09-06", value: 10 }] }), res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.headcount.save).not.toHaveBeenCalled();
  });
});

describe("HeadcountController reads and deletes", () => {
  it("lists all headcounts for the church by default", async () => {
    const { controller, repos } = makeController();
    const result = await controller.getAll(asReq({ query: {} }), res);
    expect(repos.headcount.loadAll).toHaveBeenCalledWith("c1");
    expect(result).toEqual([{ id: "hc1", value: 5 }]);
  });

  it("filters by serviceTimeId when given", async () => {
    const { controller, repos } = makeController();
    await controller.getAll(asReq({ query: { serviceTimeId: "st1" } }), res);
    expect(repos.headcount.loadByServiceTimeId).toHaveBeenCalledWith("c1", "st1");
    expect(repos.headcount.loadAll).not.toHaveBeenCalled();
  });

  it("returns 401 for reads without attendance view permission", async () => {
    const { controller } = makeController((perm) => perm !== "v");
    const result = (await controller.getAll(asReq({ query: {} }), res)) as JsonResult;
    expect(result.status).toBe(401);
  });

  it("deletes scoped to the church", async () => {
    const { controller, repos } = makeController();
    await controller.delete("hc1", asReq({}), res);
    expect(repos.headcount.delete).toHaveBeenCalledWith("c1", "hc1");
  });
});
