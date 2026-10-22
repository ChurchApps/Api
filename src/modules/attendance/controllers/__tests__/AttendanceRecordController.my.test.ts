import "reflect-metadata";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { view: "v", viewSummary: "vs" } } }));

import { AttendanceRecordController } from "../AttendanceRecordController.js";

function makeController(au: any) {
  const repos: any = {
    attendance: {
      loadForPerson: jest.fn(async () => [{ visitDate: "2026-10-18", serviceName: "Sunday Morning Service", groupId: "g1" }]),
      convertAllToModel: jest.fn((_c: string, rows: any[]) => rows.map((r) => ({ visitDate: r.visitDate, groupId: r.groupId, service: { name: r.serviceName } })))
    }
  };
  const controller = new AttendanceRecordController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("AttendanceRecordController.my", () => {
  it("returns the caller's own last 12 months of attendance without attendance view access", async () => {
    const { controller, repos } = makeController({ churchId: "c1", personId: "me", checkAccess: () => false });
    const result: any = await (controller as any).my({ query: { personId: "someoneElse" } }, {});
    expect(repos.attendance.loadForPerson).toHaveBeenCalledWith("c1", "me", expect.any(Date));
    const since: Date = repos.attendance.loadForPerson.mock.calls[0][2];
    const days = (Date.now() - since.getTime()) / 86400000;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
    expect(result).toEqual([{ visitDate: "2026-10-18", groupId: "g1", service: { name: "Sunday Morning Service" } }]);
  });

  it("rejects a caller who isn't linked to a person", async () => {
    const { controller, repos } = makeController({ churchId: "c1", checkAccess: () => true });
    const result: any = await (controller as any).my({ query: {} }, {});
    expect(result.status).toBe(401);
    expect(repos.attendance.loadForPerson).not.toHaveBeenCalled();
  });
});
