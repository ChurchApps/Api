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
const mockGateway = { loadGroupMembersForPerson: jest.fn(async () => [{ groupId: "g1" }, { groupId: "g2" }]), loadActiveGroupIds: jest.fn(async (_c: string, ids: string[]) => ids) };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => mockGateway }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: { jwtSecret: "test-secret" } }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));

import { EventController } from "../EventController.js";
import { CalendarFeedTokenHelper } from "../../helpers/CalendarFeedTokenHelper.js";
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

describe("EventController personal calendar feed", () => {
  const makeController = () => {
    const controller = new EventController();
    const loadTimeline = jest.fn(async () => [{ id: "e3", churchId: "c1", groupId: "g2", visibility: "private", title: "Elders Meeting", start: new Date("2026-08-24T18:00:00Z"), end: new Date("2026-08-24T19:00:00Z") }]);
    (controller as any).repos = { event: { loadTimeline } };
    (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
    (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", personId: "p1" });
    const res: any = { status: jest.fn(() => res), send: jest.fn(), set: jest.fn() };
    return { controller, loadTimeline, res };
  };

  it("serves the person's group events, private included, for a valid token", async () => {
    const { controller, loadTimeline, res } = makeController();
    const token = CalendarFeedTokenHelper.create("c1", "p1");
    await (controller as any).subscribe({ query: { churchId: "c1", personId: "p1", token } }, res);
    expect(mockGateway.loadGroupMembersForPerson).toHaveBeenCalledWith("c1", "p1");
    expect(loadTimeline).toHaveBeenCalledWith("c1", ["g1", "g2"], []);
    expect(res.set).toHaveBeenCalledWith("Content-Type", "text/calendar");
    const body = res.send.mock.calls[0][0];
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("Elders Meeting");
  });

  it("rejects a bad token without loading events", async () => {
    const { controller, loadTimeline, res } = makeController();
    await (controller as any).subscribe({ query: { churchId: "c1", personId: "p1", token: "bad" } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(loadTimeline).not.toHaveBeenCalled();
  });

  it("rejects a token signed for another person", async () => {
    const { controller, loadTimeline, res } = makeController();
    const token = CalendarFeedTokenHelper.create("c1", "p2");
    await (controller as any).subscribe({ query: { churchId: "c1", personId: "p1", token } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(loadTimeline).not.toHaveBeenCalled();
  });

  it("hands the signed-in person their own feed token", async () => {
    const { controller, res } = makeController();
    const result = await (controller as any).subscribeMine({}, res);
    expect(result).toEqual({ churchId: "c1", personId: "p1", token: CalendarFeedTokenHelper.create("c1", "p1") });
    expect(CalendarFeedTokenHelper.verify("c1", "p1", result.token)).toBe(true);
  });
});
