import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  CalendarHelper: { addExceptionDates: jest.fn(async (): Promise<void> => undefined) },
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
import { Event, EventBooking } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
type NamedBooking = EventBooking & { roomName?: string; resourceName?: string };
type PublicEvent = Event & { roomNames?: string[]; bookings?: unknown };

const req = {} as express.Request;

const publicEvent = { id: "e1", churchId: "c1", title: "Sunday Service", description: "Worship", photoUrl: "https://cdn/x.jpg", visibility: "public", start: new Date("2026-10-18T10:00:00Z"), end: new Date("2026-10-18T11:30:00Z") };

const build = (event: Event, bookings: NamedBooking[] = []) => {
  const controller = new EventController();
  Object.assign(controller, {
    repos: {
      event: { load: jest.fn(async () => event) },
      eventBooking: { loadForEvent: jest.fn(async () => bookings) }
    },
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action()
  });
  return controller;
};

describe("EventController public event", () => {
  it("returns photoUrl and approved room names", async () => {
    const controller = build(publicEvent, [
      { roomId: "r1", roomName: "Sanctuary", status: "approved" },
      { roomId: "r2", roomName: "Youth Room", status: "rejected" },
      { resourceId: "x1", resourceName: "Projector", status: "approved" }
    ]);
    const result = (await controller.getPublicById("c1", "e1", req, {} as express.Response)) as PublicEvent;
    expect(result.photoUrl).toBe("https://cdn/x.jpg");
    expect(result.roomNames).toEqual(["Sanctuary"]);
    expect(result.bookings).toBeUndefined();
  });

  it("hides private, non-registerable events", async () => {
    const controller = build({ ...publicEvent, visibility: "private" });
    expect(await controller.getPublicById("c1", "e1", req, {} as express.Response)).toBeNull();
  });

  it("serves a single-event ics", async () => {
    const controller = build(publicEvent);
    const res: Partial<express.Response> = { status: jest.fn(() => res as express.Response), send: jest.fn(), set: jest.fn() };
    await controller.getPublicIcal("c1", "e1", req, res as express.Response);
    expect(res.set).toHaveBeenCalledWith("Content-Type", "text/calendar");
    const body = jest.mocked(res.send).mock.calls[0][0];
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("SUMMARY:Sunday Service");
  });

  it("returns 404 ics for a hidden event", async () => {
    const controller = build({ ...publicEvent, approvalStatus: "pending" });
    const result = await controller.getPublicIcal("c1", "e1", req, {} as express.Response);
    expect((result as JsonResult).status).toBe(404);
  });
});
