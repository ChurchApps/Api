/** Issue #1300: a church with no time zone measures the check-in window in its campus zone, not New York. */
import "reflect-metadata";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e", checkin: "c", view: "v" }, services: { edit: "s" } } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/infrastructure/KyselyPool", () => ({ KyselyPool: { getDb: jest.fn() } }));

const gateway = { loadChurch: jest.fn(async () => ({ id: "CHU1", timeZone: null })), loadCampusTimeZone: jest.fn(async () => "America/Los_Angeles") };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => gateway }));

import { ServiceTimeController } from "../ServiceTimeController.js";
import { VisitController } from "../VisitController.js";

// Sunday 10:00-11:00 AM, check-in opens 30 minutes early.
const serviceTime = () => ({ id: "ST1", name: "10 AM", dayOfWeek: 0, startTime: "10:00", endTime: "11:00", checkinOpenMinutes: 30, checkinCloseMinutes: 0 });

describe("check-in window time zone", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Sunday 2026-10-18 10:15 AM Pacific (1:15 PM in New York, after the window closed there).
    jest.setSystemTime(new Date("2026-10-18T17:15:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("lists the service time as open in the campus zone", async () => {
    const times: any[] = [serviceTime()];
    await (new ServiceTimeController() as any).appendCheckinOpen("CHU1", times);
    expect(times[0].checkinOpen).toBe(true);
  });

  it("does not reject the check-in as notOpen during the local window", async () => {
    const controller: any = new VisitController();
    controller.repos = { serviceTime: { loadByIds: jest.fn(async () => [serviceTime()]) } };
    const closed = await controller.findClosedServiceTimeGroups("CHU1", { ST1: new Set(["G1"]) }, { G1: { id: "G1", name: "Nursery", checkinClosed: false } });
    expect(closed).toEqual([]);
  });

  it("keeps the church zone when it is set", async () => {
    gateway.loadChurch.mockResolvedValueOnce({ id: "CHU1", timeZone: "America/New_York" });
    const times: any[] = [serviceTime()];
    await (new ServiceTimeController() as any).appendCheckinOpen("CHU1", times);
    expect(times[0].checkinOpen).toBe(false);
  });
});
