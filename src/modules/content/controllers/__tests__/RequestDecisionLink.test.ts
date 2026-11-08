import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("ics", () => ({ createEvents: jest.fn() }));
jest.mock("../../helpers/index", () => ({
  CalendarHelper: { addExceptionDates: jest.fn() },
  HolidayHelper: { getHolidays: jest.fn() },
  Permissions: { content: { edit: "contentEdit" }, calendars: { admin: "calendarsAdmin" } }
}));
jest.mock("../../helpers/ApprovalHelper", () => ({ ApprovalHelper: { determineStatus: jest.fn(() => "pending") } }));
jest.mock("../../helpers/ConflictHelper", () => ({ ConflictHelper: { findConflicts: jest.fn() } }));
jest.mock("../../helpers/IcsHelper", () => ({ IcsHelper: { parseEvents: jest.fn() } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadGroupMembersForPerson: jest.fn(async () => []) }) }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));

import { EventController } from "../EventController.js";
import { EventBookingController } from "../EventBookingController.js";
import { NotificationService } from "../../../../shared/helpers/NotificationService.js";

const createNotifications = NotificationService.createNotifications as jest.Mock;
const au = { churchId: "c1", personId: "admin", checkAccess: (perm: any) => perm === "contentEdit" };

function wire(controller: any, repos: any) {
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(au);
  controller.json = (obj: any, status: number) => ({ obj, status });
  return controller;
}

beforeEach(() => createNotifications.mockClear());

// #1495: a request decision should open My Requests in the B1 app.
describe("request decision notifications link to My Requests (#1495)", () => {
  it("event request rejection", async () => {
    const event = { id: "e1", churchId: "c1", title: "Family issues", requestedBy: "p1", approvalStatus: "pending" };
    const controller = wire(new EventController(), { event: { load: jest.fn(async () => event), save: jest.fn(async (e: any) => e) } });
    await controller.reject("e1", {}, {});
    expect(createNotifications).toHaveBeenCalledWith(["p1"], "c1", "event", "e1", 'Your event request "Family issues" was rejected.', "/mobile/myRequests");
  });

  it("room booking approval", async () => {
    const booking = { id: "b1", churchId: "c1", eventId: "e1", roomId: "r1", status: "pending", requestedBy: "p1" };
    const repos = {
      eventBooking: { load: jest.fn(async () => booking), save: jest.fn(async (b: any) => b) },
      event: { load: jest.fn(async () => ({ id: "e1", title: "Retreat" })), save: jest.fn() },
      room: { load: jest.fn(async () => ({ id: "r1", name: "Fellowship Hall" })) },
      resource: { load: jest.fn() }
    };
    const controller = wire(new EventBookingController(), repos);
    await controller.approve("b1", { body: {} }, {});
    expect(createNotifications).toHaveBeenCalledWith(["p1"], "c1", "eventBooking", "b1", expect.stringContaining("was approved"), "/mobile/myRequests");
  });
});
