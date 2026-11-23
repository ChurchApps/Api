import "reflect-metadata";
import type express from "express";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { view: "v", viewSummary: "vs" } } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadPeople: jest.fn(async () => []) }) }));

import { AttendanceRecordController } from "../AttendanceRecordController.js";

// The DB returns a Date for visitDate; a string keeps the expected output readable.
type PersonRow = { visitDate: string; serviceName: string; groupId: string };
type TestAu = { churchId: string; personId?: string; checkAccess: (perm: string) => boolean };
type JsonResult = { obj: unknown; status: number };
const asReq = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

function makeController(au: TestAu) {
  const repos = {
    attendance: {
      loadForPerson: jest.fn(async (_churchId: string, _personId: string, _since?: Date): Promise<PersonRow[]> => [{ visitDate: "2026-10-18", serviceName: "Sunday Morning Service", groupId: "g1" }]),
      convertAllToModel: jest.fn((_c: string, rows: PersonRow[]) => rows.map((r) => ({ visitDate: r.visitDate, groupId: r.groupId, service: { name: r.serviceName } })))
    }
  };
  const controller = Object.assign(new AttendanceRecordController(), {
    repos,
    actionWrapper: (_req: unknown, _res: unknown, action: (au: TestAu) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("AttendanceRecordController.my", () => {
  it("returns the caller's own last 12 months of attendance without attendance view access", async () => {
    const { controller, repos } = makeController({ churchId: "c1", personId: "me", checkAccess: () => false });
    const result = await controller.my(asReq({ query: { personId: "someoneElse" } }), res);
    expect(repos.attendance.loadForPerson).toHaveBeenCalledWith("c1", "me", expect.any(Date));
    const since: Date = repos.attendance.loadForPerson.mock.calls[0][2];
    const days = (Date.now() - since.getTime()) / 86400000;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
    expect(result).toEqual([{ visitDate: "2026-10-18", groupId: "g1", service: { name: "Sunday Morning Service" } }]);
  });

  it("rejects a caller who isn't linked to a person", async () => {
    const { controller, repos } = makeController({ churchId: "c1", checkAccess: () => true });
    const result = (await controller.my(asReq({ query: {} }), res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.attendance.loadForPerson).not.toHaveBeenCalled();
  });
});
