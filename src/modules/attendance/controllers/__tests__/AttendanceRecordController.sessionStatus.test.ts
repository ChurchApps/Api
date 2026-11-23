import "reflect-metadata";
import type express from "express";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { view: "v", viewSummary: "vs" } } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadPeople: jest.fn(async () => []) }) }));

import { AttendanceRecordController } from "../AttendanceRecordController.js";
import type { AttendanceSessionStatusRow } from "../../repositories/AttendanceRepo.js";

type JsonResult = { obj: unknown; status: number };
const asReq = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

function makeController(access: (perm: string) => boolean = () => true) {
  const repos = {
    attendance: {
      loadSessionStatus: jest.fn(async (): Promise<AttendanceSessionStatusRow[]> => [
        { groupId: "g1", sessionId: "s1", attendanceCount: "3" },
        { groupId: "g2", sessionId: null, attendanceCount: 0 }
      ])
    }
  };
  const au = { churchId: "c1", checkAccess: access };
  const controller = Object.assign(new AttendanceRecordController(), {
    repos,
    actionWrapper: (_req: unknown, _res: unknown, action: (user: typeof au) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("AttendanceRecordController.sessionStatus", () => {
  it("returns each group's session and attendance count for the service time and date", async () => {
    const { controller, repos } = makeController();
    const result = await controller.sessionStatus(asReq({ query: { serviceTimeId: "st1", date: "2026-09-27" } }), res);
    expect(repos.attendance.loadSessionStatus).toHaveBeenCalledWith("c1", "st1", "2026-09-27");
    expect(result).toEqual([
      { groupId: "g1", sessionId: "s1", attendanceCount: 3 },
      { groupId: "g2", sessionId: null, attendanceCount: 0 }
    ]);
  });

  it("requires attendance view access", async () => {
    const { controller, repos } = makeController((perm) => perm !== "v");
    const result = (await controller.sessionStatus(asReq({ query: { serviceTimeId: "st1", date: "2026-09-27" } }), res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.attendance.loadSessionStatus).not.toHaveBeenCalled();
  });

  it("rejects a missing service time or a malformed date with 400", async () => {
    const { controller, repos } = makeController();
    const noSt = (await controller.sessionStatus(asReq({ query: { date: "2026-09-27" } }), res)) as JsonResult;
    const badDate = (await controller.sessionStatus(asReq({ query: { serviceTimeId: "st1", date: "9/27/2026" } }), res)) as JsonResult;
    expect(noSt.status).toBe(400);
    expect(badDate.status).toBe(400);
    expect(repos.attendance.loadSessionStatus).not.toHaveBeenCalled();
  });
});
