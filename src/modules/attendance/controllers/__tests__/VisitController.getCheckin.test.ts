import "reflect-metadata";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e", checkin: "c", view: "v" } } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../helpers/index", () => ({
  SecurityCodeHelper: { generate: () => "ABCD" },
  CheckinGateHelper: jest.requireActual("../../helpers/CheckinGateHelper").CheckinGateHelper,
  CheckinTimeZoneHelper: jest.requireActual("../../helpers/CheckinTimeZoneHelper").CheckinTimeZoneHelper
}));

const gateway = { loadChurch: jest.fn(async () => ({ id: "c1", timeZone: "America/Chicago" })), loadCampusTimeZones: jest.fn(async () => ({})), loadCampusTimeZone: jest.fn(async () => null) };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => gateway }));

import { VisitController } from "../VisitController.js";

// Monday 6:30 PM rehearsal and Wednesday 6:00 PM rehearsal under one service.
const monday = { id: "stMon", serviceId: "s1", dayOfWeek: 1, startTime: "18:30:00", endTime: "20:00:00", checkinOpenMinutes: 30, checkinCloseMinutes: 15 };
const wednesday = { id: "stWed", serviceId: "s1", dayOfWeek: 3, startTime: "18:00:00", endTime: "19:30:00", checkinOpenMinutes: 30, checkinCloseMinutes: 15 };

function makeController(visitDate: Date) {
  const repos: any = {
    visit: {
      convertAllToModel: (_c: string, rows: any[]) => rows,
      loadLastLoggedDate: jest.fn(async () => visitDate),
      loadByServiceDatePeopleIds: jest.fn(async () => [{ id: "v0", personId: "p1", serviceId: "s1", visitDate, securityCode: "ABCD" }])
    },
    visitSession: {
      convertAllToModel: (_c: string, rows: any[]) => rows,
      loadByVisitIds: jest.fn(async () => [
        { id: "vs1", visitId: "v0", sessionId: "sessMon" },
        { id: "vs2", visitId: "v0", sessionId: "sessWed" }
      ])
    },
    session: {
      convertAllToModel: (_c: string, rows: any[]) => rows,
      loadByIds: jest.fn(async () => [
        { id: "sessMon", groupId: "g1", serviceTimeId: "stMon" },
        { id: "sessWed", groupId: "g2", serviceTimeId: "stWed" }
      ])
    },
    serviceTime: { loadByIds: jest.fn(async () => [monday, wednesday]) },
    service: { loadAll: jest.fn(async () => [{ id: "s1", campusId: null }]) }
  };
  const au = { churchId: "c1", id: "u1", checkAccess: () => true };
  const controller = new VisitController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return controller;
}

const req = { query: { serviceId: "s1", peopleIds: "p1" } };
const serviceTimeIds = (result: any[]) => result[0].visitSessions.map((vs: any) => vs.session.serviceTimeId);

// ChurchAppsSupport#1461: a closed service time from an earlier visit must not ride into today's check-in.
describe("getCheckin template visit", () => {
  // Monday 2026-11-02 6:35 PM Chicago, inside the Monday window; Wednesday's is closed.
  beforeEach(() => jest.useFakeTimers({ now: new Date("2026-11-02T18:35:00-06:00"), doNotFake: ["setTimeout", "nextTick", "setImmediate"] }));
  afterEach(() => jest.useRealTimers());

  it("drops sessions for a closed service time from a visit on an earlier date", async () => {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    lastWeek.setHours(0, 0, 0, 0);
    const result: any = await (makeController(lastWeek) as any).getCheckin(req, {});
    expect(serviceTimeIds(result)).toEqual(["stMon"]);
  });

  it("keeps every session of today's visit", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result: any = await (makeController(today) as any).getCheckin(req, {});
    expect(serviceTimeIds(result)).toEqual(["stMon", "stWed"]);
  });
});
