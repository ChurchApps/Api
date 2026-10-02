import "reflect-metadata";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { view: "v", viewSummary: "vs" } } }));

import { AttendanceRecordController } from "../AttendanceRecordController.js";

function makeController(access: (perm: string) => boolean = () => true) {
  const repos: any = {
    attendance: {
      loadSessionStatus: jest.fn(async () => [
        { groupId: "g1", sessionId: "s1", attendanceCount: "3" },
        { groupId: "g2", sessionId: null, attendanceCount: 0 }
      ])
    }
  };
  const au = { churchId: "c1", checkAccess: access };
  const controller = new AttendanceRecordController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("AttendanceRecordController.sessionStatus", () => {
  it("returns each group's session and attendance count for the service time and date", async () => {
    const { controller, repos } = makeController();
    const result: any = await (controller as any).sessionStatus({ query: { serviceTimeId: "st1", date: "2026-09-27" } }, {});
    expect(repos.attendance.loadSessionStatus).toHaveBeenCalledWith("c1", "st1", "2026-09-27");
    expect(result).toEqual([
      { groupId: "g1", sessionId: "s1", attendanceCount: 3 },
      { groupId: "g2", sessionId: null, attendanceCount: 0 }
    ]);
  });

  it("requires attendance view access", async () => {
    const { controller, repos } = makeController((perm) => perm !== "v");
    const result: any = await (controller as any).sessionStatus({ query: { serviceTimeId: "st1", date: "2026-09-27" } }, {});
    expect(result.status).toBe(401);
    expect(repos.attendance.loadSessionStatus).not.toHaveBeenCalled();
  });

  it("rejects a missing service time or a malformed date with 400", async () => {
    const { controller, repos } = makeController();
    const noSt: any = await (controller as any).sessionStatus({ query: { date: "2026-09-27" } }, {});
    const badDate: any = await (controller as any).sessionStatus({ query: { serviceTimeId: "st1", date: "9/27/2026" } }, {});
    expect(noSt.status).toBe(400);
    expect(badDate.status).toBe(400);
    expect(repos.attendance.loadSessionStatus).not.toHaveBeenCalled();
  });
});
