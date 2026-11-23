import "reflect-metadata";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class {} }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { view: "v" } }, Environment: {} }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("axios", () => ({ get: jest.fn() }));
const gateway = { loadPeople: jest.fn(async () => [{ id: "mom", displayName: "Mary Smith" }]) };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => gateway }));

import type express from "express";
import { toSessionDownloadRow, VisitSessionController } from "../VisitSessionController.js";
import type { Session, VisitSession } from "../../models/index.js";

const session = { id: "s1", groupId: "g1", sessionDate: new Date("2026-01-04") } as Session;
const member = { personId: "p1", displayName: "Tommy Smith" };

describe("toSessionDownloadRow", () => {
  it("carries check-in time, checked-in-by, check-out time, picked-up-by and type for a present member", () => {
    const checkinTime = new Date("2026-01-04T08:45:00");
    const checkoutTime = new Date("2026-01-04T10:15:00");
    const vs: VisitSession = { id: "vs1", visitId: "v1", sessionId: "s1", visit: { id: "v1", personId: "p1", checkinType: "guest", checkinTime, checkoutTime, checkedOutBy: "Jane Smith", checkedInById: "mom", checkedInBy: "Mary Smith" } };
    expect(toSessionDownloadRow(member, session, vs)).toEqual({
      id: "vs1",
      personId: "p1",
      visitId: "v1",
      sessionDate: session.sessionDate,
      personName: "Tommy Smith",
      status: "present",
      checkinTime,
      checkoutTime,
      checkedOutBy: "Jane Smith",
      checkedInBy: "Mary Smith",
      checkinType: "guest"
    });
  });

  it("leaves the check-in columns blank for an absent member", () => {
    const row = toSessionDownloadRow(member, session);
    expect(row).toMatchObject({ id: "", visitId: "", status: "absent", checkinTime: null, checkoutTime: null, checkedOutBy: "", checkedInBy: "", checkinType: "" });
  });

  it("leaves check-out blank for a member still checked in", () => {
    const vs: VisitSession = { id: "vs1", visitId: "v1", visit: { personId: "p1", checkinTime: new Date("2026-01-04T08:45:00") } };
    const row = toSessionDownloadRow(member, session, vs);
    expect(row.checkoutTime).toBeNull();
    expect(row.checkedOutBy).toBe("");
  });
});

describe("VisitSessionController.getAll checked in by", () => {
  it("names the adult who checked each visit in", async () => {
    const visitSessions: VisitSession[] = [
      { id: "vs1", visitId: "v1", visit: { id: "v1", personId: "p1", checkedInById: "mom" } },
      { id: "vs2", visitId: "v2", visit: { id: "v2", personId: "p2" } }
    ];
    const au = { churchId: "c1", leaderGroupIds: [] as string[], checkAccess: () => true };
    const controller = Object.assign(new VisitSessionController(), {
      repos: { session: { load: jest.fn(async () => session) }, visitSession: { loadForSession: jest.fn(async () => visitSessions) } },
      actionWrapper: (_req: unknown, _res: unknown, action: (user: typeof au) => Promise<unknown>) => action(au)
    });
    const result = (await controller.getAll({ query: { sessionId: "s1" } } as unknown as express.Request, {} as express.Response)) as VisitSession[];
    expect(gateway.loadPeople).toHaveBeenCalledWith("c1", ["mom"]);
    expect(result[0].visit.checkedInBy).toBe("Mary Smith");
    expect(result[1].visit.checkedInBy).toBeUndefined();
  });
});
