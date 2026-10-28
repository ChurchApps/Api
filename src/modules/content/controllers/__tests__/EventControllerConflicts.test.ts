import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("ics", () => ({ createEvents: jest.fn() }));
jest.mock("../../helpers/index", () => ({
  CalendarHelper: { addExceptionDates: jest.fn() },
  HolidayHelper: { getHolidays: jest.fn() },
  Permissions: { content: { edit: "contentEdit" }, calendars: { admin: "calendarsAdmin" } }
}));
jest.mock("../../helpers/ApprovalHelper", () => ({ ApprovalHelper: { determineStatus: jest.fn(() => "pending") } }));
jest.mock("../../helpers/ConflictHelper", () => ({
  ConflictHelper: {
    computeWindow: jest.fn(() => ({ windowStart: new Date("2026-11-01T00:00:00Z"), windowEnd: new Date("2026-11-02T00:00:00Z") })),
    findConflicts: jest.fn(() => [])
  }
}));
jest.mock("../../helpers/IcsHelper", () => ({ IcsHelper: { parseEvents: jest.fn() } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
const mockGateway = { loadChurch: jest.fn() };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => mockGateway }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));

import { EventController } from "../EventController.js";
import { ConflictHelper } from "../../helpers/ConflictHelper.js";

function makeController() {
  const repos: any = {
    eventBooking: { loadActiveForRooms: jest.fn(async () => []), loadActiveForResources: jest.fn(async () => []) },
    room: { loadByIds: jest.fn(async () => []) },
    resource: { loadByIds: jest.fn(async () => []) },
    calendarBlockout: { loadOverlapping: jest.fn(async () => []) }
  };
  const au = { churchId: "c1", personId: "p1", checkAccess: () => true };
  const controller = new EventController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  return controller;
}

const body = { start: "2026-11-01T15:00:00.000Z", end: "2026-11-01T16:00:00.000Z", roomIds: [] as string[], resources: [] as any[], timeZone: "America/Chicago" };

describe("EventController.conflicts time zone (#1407)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("words warnings in the browser's zone when the church has none", async () => {
    mockGateway.loadChurch.mockResolvedValue({ id: "c1", timeZone: "" });
    await (makeController() as any).conflicts({ body }, {});
    expect(ConflictHelper.findConflicts).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ timeZone: "America/Chicago" }));
  });

  it("keeps the church zone over the browser's zone", async () => {
    mockGateway.loadChurch.mockResolvedValue({ id: "c1", timeZone: "America/New_York" });
    await (makeController() as any).conflicts({ body }, {});
    expect(ConflictHelper.findConflicts).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ timeZone: "America/New_York" }));
  });
});
