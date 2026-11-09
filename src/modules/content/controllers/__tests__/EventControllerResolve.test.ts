import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("ics", () => ({ createEvents: jest.fn() }));
jest.mock("../../helpers/index", () => ({
  CalendarHelper: { addExceptionDates: jest.fn(async (events: any[]) => events.forEach((e) => { e.exceptionDates = ["2026-10-25"]; })) },
  HolidayHelper: { getHolidays: jest.fn() },
  Permissions: { content: { edit: "contentEdit" }, calendars: { admin: "calendarsAdmin" } }
}));
jest.mock("../../helpers/ApprovalHelper", () => ({ ApprovalHelper: { determineStatus: jest.fn(() => "pending") } }));
jest.mock("../../helpers/ConflictHelper", () => ({ ConflictHelper: { findConflicts: jest.fn() } }));
jest.mock("../../helpers/IcsHelper", () => ({ IcsHelper: { parseEvents: jest.fn() } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
const mockGateway = { loadGroupMembersForPerson: jest.fn(async () => []), loadActiveGroupIds: jest.fn(async (_c: string, ids: string[]) => ids) };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => mockGateway }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));

import { NotificationService } from "../../../../shared/helpers/NotificationService";
import { EventController } from "../EventController.js";

function makeRepos(event: any) {
  return { event: { load: jest.fn(async () => ({ ...event })), save: jest.fn(async (e: any) => e) } };
}

function wire(repos: any) {
  const controller: any = new EventController();
  const au = { churchId: "c1", personId: "p1", checkAccess: (perm: any) => perm === "calendarsAdmin" };
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(au);
  controller.json = (obj: any, status: number) => ({ obj, status });
  return controller;
}

describe("reversing an event request decision", () => {
  beforeEach(() => (NotificationService.createNotifications as jest.Mock).mockClear());

  it("rejecting an approved event takes it back off the public calendar", async () => {
    const repos = makeRepos({ id: "e1", churchId: "c1", title: "Picnic", requestedBy: "p2", approvalStatus: "approved", visibility: "public" });
    await wire(repos).reject("e1", {}, {});
    expect(repos.event.save).toHaveBeenCalledWith(expect.objectContaining({ approvalStatus: "rejected", visibility: "private" }));
    expect(NotificationService.createNotifications).toHaveBeenCalledTimes(1);
  });

  it("approving a rejected event publishes it", async () => {
    const repos = makeRepos({ id: "e1", churchId: "c1", title: "Picnic", requestedBy: "p2", approvalStatus: "rejected", visibility: "private" });
    await wire(repos).approve("e1", {}, {});
    expect(repos.event.save).toHaveBeenCalledWith(expect.objectContaining({ approvalStatus: "approved", visibility: "public" }));
    expect(NotificationService.createNotifications).toHaveBeenCalledTimes(1);
  });
});
