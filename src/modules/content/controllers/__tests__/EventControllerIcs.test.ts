import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  CalendarHelper: { addExceptionDates: jest.fn(async (events: any[]) => { events.forEach((e) => { e.exceptionDates = [new Date("2026-09-06T10:00:00Z")]; }); }) },
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

describe("EventController.subscribe ICS", () => {
  it("emits a calendar for events that have exception dates", async () => {
    const controller = new EventController();
    (controller as any).repos = {
      event: { loadPublicForGroup: jest.fn(async () => [{ id: "e1", churchId: "c1", title: "Sunday Service", start: new Date("2026-08-23T10:00:00Z"), end: new Date("2026-08-23T11:30:00Z"), recurrenceRule: "FREQ=WEEKLY;BYDAY=SU" }]) }
    };
    (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
    const res: any = { status: jest.fn(() => res), send: jest.fn(), set: jest.fn() };
    await (controller as any).subscribe({ query: { groupId: "g1", churchId: "c1" } }, res);
    expect(res.status).not.toHaveBeenCalledWith(500);
    const body = res.send.mock.calls[0][0];
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("EXDATE");
  });
});
