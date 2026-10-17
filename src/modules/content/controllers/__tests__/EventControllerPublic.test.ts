import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  CalendarHelper: { addExceptionDates: jest.fn(async () => undefined) },
  HolidayHelper: { getHolidays: jest.fn() },
  Permissions: { content: { edit: "contentEdit" }, calendars: { admin: "calAdmin" } }
}));
jest.mock("../../helpers/ApprovalHelper", () => ({ ApprovalHelper: { determineStatus: jest.fn() } }));
jest.mock("../../helpers/ConflictHelper", () => ({ ConflictHelper: { findConflicts: jest.fn() } }));
jest.mock("../../helpers/IcsHelper", () => ({ IcsHelper: { parseEvents: jest.fn() } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({}) }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));

import { EventController } from "../EventController.js";

const publicEvent = { id: "e1", churchId: "c1", title: "Sunday Service", description: "Worship", photoUrl: "https://cdn/x.jpg", visibility: "public", start: new Date("2026-10-18T10:00:00Z"), end: new Date("2026-10-18T11:30:00Z") };

const build = (event: any, bookings: any[] = []) => {
  const controller = new EventController();
  (controller as any).repos = {
    event: { load: jest.fn(async () => event) },
    eventBooking: { loadForEvent: jest.fn(async () => bookings) }
  };
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  return controller;
};

describe("EventController public event", () => {
  it("returns photoUrl and approved room names", async () => {
    const controller = build(publicEvent, [
      { roomId: "r1", roomName: "Sanctuary", status: "approved" },
      { roomId: "r2", roomName: "Youth Room", status: "rejected" },
      { resourceId: "x1", resourceName: "Projector", status: "approved" }
    ]);
    const result = await (controller as any).getPublicById("c1", "e1", {}, {});
    expect(result.photoUrl).toBe("https://cdn/x.jpg");
    expect(result.roomNames).toEqual(["Sanctuary"]);
    expect(result.bookings).toBeUndefined();
  });

  it("hides private, non-registerable events", async () => {
    const controller = build({ ...publicEvent, visibility: "private" });
    expect(await (controller as any).getPublicById("c1", "e1", {}, {})).toBeNull();
  });

  it("serves a single-event ics", async () => {
    const controller = build(publicEvent);
    const res: any = { status: jest.fn(() => res), send: jest.fn(), set: jest.fn() };
    await (controller as any).getPublicIcal("c1", "e1", {}, res);
    expect(res.set).toHaveBeenCalledWith("Content-Type", "text/calendar");
    const body = res.send.mock.calls[0][0];
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("SUMMARY:Sunday Service");
  });

  it("returns 404 ics for a hidden event", async () => {
    const controller = build({ ...publicEvent, approvalStatus: "pending" });
    const result = await (controller as any).getPublicIcal("c1", "e1", {}, {});
    expect(result.status).toBe(404);
  });
});
