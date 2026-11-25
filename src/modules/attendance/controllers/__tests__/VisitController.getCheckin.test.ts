import "reflect-metadata";
import type express from "express";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e", checkin: "c", view: "v" } } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../helpers/index", () => ({
  SecurityCodeHelper: { generate: () => "ABCD" },
  CheckinGateHelper: jest.requireActual("../../helpers/CheckinGateHelper").CheckinGateHelper,
  CheckinTimeZoneHelper: jest.requireActual("../../helpers/CheckinTimeZoneHelper").CheckinTimeZoneHelper
}));

const gateway = { loadChurch: jest.fn(async () => ({ id: "c1", timeZone: "America/Chicago" })), loadCampusTimeZones: jest.fn(async () => ({})), loadCampusTimeZone: jest.fn(async (): Promise<string | null> => null) };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => gateway }));

import { VisitController } from "../VisitController.js";
import type { Session, ServiceTime, Visit, VisitSession } from "../../models/index.js";

// Monday 6:30 PM rehearsal and Wednesday 6:00 PM rehearsal under one service.
const monday: ServiceTime = { id: "stMon", serviceId: "s1", dayOfWeek: 1, startTime: "18:30:00", endTime: "20:00:00", checkinOpenMinutes: 30, checkinCloseMinutes: 15 };
const wednesday: ServiceTime = { id: "stWed", serviceId: "s1", dayOfWeek: 3, startTime: "18:00:00", endTime: "19:30:00", checkinOpenMinutes: 30, checkinCloseMinutes: 15 };

function makeController(visitDate: Date) {
  const repos = {
    visit: {
      convertAllToModel: (_c: string, rows: Visit[]) => rows,
      loadLastLoggedDate: jest.fn(async () => visitDate),
      loadByServiceDatePeopleIds: jest.fn(async (): Promise<Visit[]> => [{ id: "v0", personId: "p1", serviceId: "s1", visitDate, securityCode: "ABCD" }])
    },
    visitSession: {
      convertAllToModel: (_c: string, rows: VisitSession[]) => rows,
      loadByVisitIds: jest.fn(async (): Promise<VisitSession[]> => [
        { id: "vs1", visitId: "v0", sessionId: "sessMon" },
        { id: "vs2", visitId: "v0", sessionId: "sessWed" }
      ])
    },
    session: {
      convertAllToModel: (_c: string, rows: Session[]) => rows,
      loadByIds: jest.fn(async (): Promise<Session[]> => [
        { id: "sessMon", groupId: "g1", serviceTimeId: "stMon" },
        { id: "sessWed", groupId: "g2", serviceTimeId: "stWed" }
      ])
    },
    serviceTime: { loadByIds: jest.fn(async () => [monday, wednesday]) },
    service: { loadAll: jest.fn(async (): Promise<{ id: string; campusId?: string | null }[]> => [{ id: "s1", campusId: null }]) }
  };
  const au = { churchId: "c1", id: "u1", checkAccess: () => true };
  return Object.assign(new VisitController(), {
    repos,
    actionWrapper: (_req: unknown, _res: unknown, action: (user: typeof au) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
}

const asReq = (r: Partial<express.Request>) => r as express.Request;
const req = asReq({ query: { serviceId: "s1", peopleIds: "p1" } });
const res = {} as express.Response;
const serviceTimeIds = (result: Visit[]) => result[0].visitSessions.map((vs) => vs.session.serviceTimeId);

// ChurchAppsSupport#1461: a closed service time from an earlier visit must not ride into today's check-in.
describe("getCheckin template visit", () => {
  // Monday 2026-11-02 6:35 PM Chicago, inside the Monday window; Wednesday's is closed.
  beforeEach(() => jest.useFakeTimers({ now: new Date("2026-11-02T18:35:00-06:00"), doNotFake: ["setTimeout", "nextTick", "setImmediate"] }));
  afterEach(() => jest.useRealTimers());

  it("drops sessions for a closed service time from a visit on an earlier date", async () => {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    lastWeek.setHours(0, 0, 0, 0);
    const result = (await makeController(lastWeek).getCheckin(req, res)) as Visit[];
    expect(serviceTimeIds(result)).toEqual(["stMon"]);
  });

  it("keeps every session of today's visit", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = (await makeController(today).getCheckin(req, res)) as Visit[];
    expect(serviceTimeIds(result)).toEqual(["stMon", "stWed"]);
  });
});
