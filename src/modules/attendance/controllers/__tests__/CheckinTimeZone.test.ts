/** Issues #1300 and #1302: the check-in window is measured in the service's campus zone, then the church zone, then New York. */
import "reflect-metadata";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e", checkin: "c", view: "v" }, services: { edit: "s" } } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/infrastructure/KyselyPool", () => ({ KyselyPool: { getDb: jest.fn() } }));

const gateway = { loadChurch: jest.fn(async () => ({ id: "CHU1", timeZone: null })), loadCampusTimeZone: jest.fn(async () => "America/Los_Angeles"), loadCampusTimeZones: jest.fn(async (): Promise<Record<string, string>> => ({})) };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => gateway }));

import { ServiceTimeController } from "../ServiceTimeController.js";
import { VisitController } from "../VisitController.js";

// Sunday 10:00-11:00 AM, check-in opens 30 minutes early.
const serviceTime = () => ({ id: "ST1", serviceId: "S1", name: "10 AM", dayOfWeek: 0, startTime: "10:00", endTime: "11:00", checkinOpenMinutes: 30, checkinCloseMinutes: 0 });

const services = { loadAll: jest.fn(async () => [{ id: "S1", campusId: "CAM1", name: "Sunday" }]) };
const serviceTimeController = () => {
  const controller: any = new ServiceTimeController();
  controller.repos = { service: services };
  return controller;
};

describe("check-in window time zone", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Sunday 2026-10-18 10:15 AM Pacific (1:15 PM in New York, after the window closed there).
    jest.setSystemTime(new Date("2026-10-18T17:15:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("lists the service time as open in the campus zone", async () => {
    const times: any[] = [serviceTime()];
    await serviceTimeController().appendCheckinOpen("CHU1", times);
    expect(times[0].checkinOpen).toBe(true);
  });

  it("does not reject the check-in as notOpen during the local window", async () => {
    const controller: any = new VisitController();
    controller.repos = { serviceTime: { loadByIds: jest.fn(async () => [serviceTime()]) }, service: services };
    const closed = await controller.findClosedServiceTimeGroups("CHU1", { ST1: new Set(["G1"]) }, { G1: { id: "G1", name: "Nursery", checkinClosed: false } });
    expect(closed).toEqual([]);
  });

  it("keeps the church zone when it is set", async () => {
    gateway.loadChurch.mockResolvedValueOnce({ id: "CHU1", timeZone: "America/New_York" });
    const times: any[] = [serviceTime()];
    await serviceTimeController().appendCheckinOpen("CHU1", times);
    expect(times[0].checkinOpen).toBe(false);
  });

  describe("church zone stored as the New York default (#1302)", () => {
    beforeEach(() => {
      // Sunday 2026-10-18 09:45 AM in Lagos, 4:45 AM in New York (before the window opens there).
      jest.setSystemTime(new Date("2026-10-18T08:45:00Z"));
      gateway.loadChurch.mockResolvedValue({ id: "CHU1", timeZone: "America/New_York" });
      gateway.loadCampusTimeZones.mockResolvedValue({ CAM1: "Africa/Lagos" });
    });
    afterEach(() => {
      gateway.loadChurch.mockResolvedValue({ id: "CHU1", timeZone: null });
      gateway.loadCampusTimeZones.mockResolvedValue({});
    });

    it("lists the service time as open in its campus zone", async () => {
      const times: any[] = [serviceTime()];
      await serviceTimeController().appendCheckinOpen("CHU1", times);
      expect(times[0].checkinOpen).toBe(true);
    });

    it("does not reject the check-in as notOpen during the campus window", async () => {
      const controller: any = new VisitController();
      controller.repos = { serviceTime: { loadByIds: jest.fn(async () => [serviceTime()]) }, service: services };
      const closed = await controller.findClosedServiceTimeGroups("CHU1", { ST1: new Set(["G1"]) }, { G1: { id: "G1", name: "Nursery", checkinClosed: false } });
      expect(closed).toEqual([]);
    });
  });
});
