import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  CalendarHelper: { addExceptionDates: jest.fn(async (events: Event[]) => { events.forEach((e) => { e.exceptionDates = [new Date("2026-09-06T10:00:00Z")]; }); }) },
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
import { Event } from "../../models/index.js";

const makeRes = () => {
  const res: Partial<express.Response> = { status: jest.fn(() => res as express.Response), send: jest.fn(), set: jest.fn() };
  return res;
};
const query: express.Request["query"] = { groupId: "g1", churchId: "c1" };
const anon = (_req: express.Request, _res: express.Response, action: () => unknown) => action();

describe("EventController.subscribe ICS", () => {
  it("emits a calendar for events that have exception dates", async () => {
    const controller = new EventController();
    Object.assign(controller, { repos: { event: { loadPublicForGroup: jest.fn(async () => [{ id: "e1", churchId: "c1", title: "Sunday Service", start: new Date("2026-08-23T10:00:00Z"), end: new Date("2026-08-23T11:30:00Z"), recurrenceRule: "FREQ=WEEKLY;BYDAY=SU" }]) } }, actionWrapperAnon: anon });
    const res = makeRes();
    await controller.subscribe({ query } as express.Request, res as express.Response);
    expect(res.status).not.toHaveBeenCalledWith(500);
    const body = jest.mocked(res.send).mock.calls[0][0];
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("EXDATE");
  });

  it("omits EXDATE for events without exception dates", async () => {
    const { CalendarHelper } = jest.requireMock("../../helpers/index");
    CalendarHelper.addExceptionDates.mockImplementationOnce(async (events: Event[]) => { events.forEach((e) => { e.exceptionDates = []; }); });
    const controller = new EventController();
    Object.assign(controller, { repos: { event: { loadPublicForGroup: jest.fn(async () => [{ id: "e2", churchId: "c1", title: "Picnic", start: new Date("2026-08-23T10:00:00Z"), end: new Date("2026-08-23T11:30:00Z") }]) } }, actionWrapperAnon: anon });
    const res = makeRes();
    await controller.subscribe({ query } as express.Request, res as express.Response);
    expect(res.status).not.toHaveBeenCalledWith(500);
    const body = jest.mocked(res.send).mock.calls[0][0];
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).not.toContain("EXDATE");
  });
});
