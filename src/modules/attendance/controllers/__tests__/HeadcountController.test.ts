import "reflect-metadata";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e", view: "v" } } }));

import { HeadcountController } from "../HeadcountController.js";

function makeController(access: (perm: string) => boolean = () => true) {
  const repos: any = {
    headcount: {
      convertAllToModel: (_c: string, rows: any[]) => rows,
      convertToModel: (_c: string, row: any) => row,
      save: jest.fn(async (h: any) => { if (!h.id) h.id = "hc1"; return h; }),
      delete: jest.fn(),
      load: jest.fn(async () => ({ id: "hc1", value: 5 })),
      loadAll: jest.fn(async () => [{ id: "hc1", value: 5 }]),
      loadByServiceTimeId: jest.fn(async () => []),
      loadByGroupId: jest.fn(async () => [])
    }
  };
  const au = { churchId: "c1", id: "u1", personId: "p1", checkAccess: access };
  const controller = new HeadcountController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("HeadcountController.save", () => {
  it("stamps churchId and enteredBy on new rows and coerces value to a number", async () => {
    const { controller, repos } = makeController();
    const result: any = await (controller as any).save({ body: [{ serviceTimeId: "st1", headcountDate: "2026-09-06", value: "120" }] }, {});
    expect(repos.headcount.save).toHaveBeenCalledTimes(1);
    const saved = repos.headcount.save.mock.calls[0][0];
    expect(saved.churchId).toBe("c1");
    expect(saved.enteredBy).toBe("p1");
    expect(saved.value).toBe(120);
    expect(result[0].id).toBe("hc1");
  });

  it("does not overwrite enteredBy when updating an existing row", async () => {
    const { controller, repos } = makeController();
    await (controller as any).save({ body: [{ id: "hc9", serviceTimeId: "st1", headcountDate: "2026-09-06", value: 80, enteredBy: "orig" }] }, {});
    expect(repos.headcount.save.mock.calls[0][0].enteredBy).toBe("orig");
  });

  it("rejects negative and non-integer values with 400 and saves nothing", async () => {
    const { controller, repos } = makeController();
    const neg: any = await (controller as any).save({ body: [{ serviceTimeId: "st1", headcountDate: "2026-09-06", value: -1 }] }, {});
    const frac: any = await (controller as any).save({ body: [{ serviceTimeId: "st1", headcountDate: "2026-09-06", value: 1.5 }] }, {});
    const text: any = await (controller as any).save({ body: [{ serviceTimeId: "st1", headcountDate: "2026-09-06", value: "lots" }] }, {});
    expect(neg.status).toBe(400);
    expect(frac.status).toBe(400);
    expect(text.status).toBe(400);
    expect(repos.headcount.save).not.toHaveBeenCalled();
  });

  it("requires a date and at least one of service, service time or group", async () => {
    const { controller, repos } = makeController();
    const noDate: any = await (controller as any).save({ body: [{ serviceTimeId: "st1", value: 10 }] }, {});
    const noTarget: any = await (controller as any).save({ body: [{ headcountDate: "2026-09-06", value: 10 }] }, {});
    expect(noDate.status).toBe(400);
    expect(noTarget.status).toBe(400);
    expect(repos.headcount.save).not.toHaveBeenCalled();
  });

  it("returns 401 without attendance edit permission", async () => {
    const { controller, repos } = makeController((perm) => perm !== "e");
    const result: any = await (controller as any).save({ body: [{ serviceTimeId: "st1", headcountDate: "2026-09-06", value: 10 }] }, {});
    expect(result.status).toBe(401);
    expect(repos.headcount.save).not.toHaveBeenCalled();
  });
});

describe("HeadcountController reads and deletes", () => {
  it("lists all headcounts for the church by default", async () => {
    const { controller, repos } = makeController();
    const result: any = await (controller as any).getAll({ query: {} }, {});
    expect(repos.headcount.loadAll).toHaveBeenCalledWith("c1");
    expect(result).toEqual([{ id: "hc1", value: 5 }]);
  });

  it("filters by serviceTimeId when given", async () => {
    const { controller, repos } = makeController();
    await (controller as any).getAll({ query: { serviceTimeId: "st1" } }, {});
    expect(repos.headcount.loadByServiceTimeId).toHaveBeenCalledWith("c1", "st1");
    expect(repos.headcount.loadAll).not.toHaveBeenCalled();
  });

  it("returns 401 for reads without attendance view permission", async () => {
    const { controller } = makeController((perm) => perm !== "v");
    const result: any = await (controller as any).getAll({ query: {} }, {});
    expect(result.status).toBe(401);
  });

  it("deletes scoped to the church", async () => {
    const { controller, repos } = makeController();
    await (controller as any).delete("hc1", {}, {});
    expect(repos.headcount.delete).toHaveBeenCalledWith("c1", "hc1");
  });
});
