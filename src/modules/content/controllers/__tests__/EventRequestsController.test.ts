import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("ics", () => ({ createEvents: jest.fn() }));
jest.mock("../../helpers/index", () => ({
  CalendarHelper: { addExceptionDates: jest.fn() },
  HolidayHelper: { getHolidays: jest.fn() },
  Permissions: { content: { edit: "contentEdit" } }
}));
jest.mock("../../helpers/ApprovalHelper", () => ({ ApprovalHelper: { determineStatus: jest.fn(() => "pending") } }));
jest.mock("../../helpers/ConflictHelper", () => ({ ConflictHelper: { findConflicts: jest.fn() } }));
jest.mock("../../helpers/IcsHelper", () => ({ IcsHelper: { parseEvents: jest.fn() } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadGroupMembersForPerson: jest.fn(async () => []) }) }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));

import { EventController } from "../EventController.js";

function makeController(opts: any = {}) {
  const repos: any = {
    event: {
      load: jest.fn(async () => opts.event),
      loadRequestsForPerson: jest.fn(async () => opts.requests ?? []),
      delete: jest.fn(async () => undefined)
    },
    eventBooking: {
      loadForEvent: jest.fn(async () => opts.bookings ?? []),
      deleteForEvent: jest.fn(async () => undefined)
    }
  };
  const au = { churchId: "c1", personId: opts.personId ?? "p1", checkAccess: (perm: any) => (opts.access ?? []).includes(perm) };
  const controller = new EventController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("EventController.getMyRequests (CA-1)", () => {
  it("returns only the caller's requests with their bookings", async () => {
    const { controller, repos } = makeController({ requests: [{ id: "e1", title: "Retreat", requestedBy: "p1" }], bookings: [{ id: "b1", status: "pending" }] });
    const result = await (controller as any).getMyRequests({}, {});
    expect(repos.event.loadRequestsForPerson).toHaveBeenCalledWith("c1", "p1");
    expect(result[0]).toMatchObject({ id: "e1", bookings: [{ id: "b1", status: "pending" }] });
  });
});

describe("EventController.delete self-cancel guard (CA-1)", () => {
  it("lets the requester cancel their own pending request", async () => {
    const { controller, repos } = makeController({ personId: "p1", event: { id: "e1", requestedBy: "p1", approvalStatus: "pending" } });
    await (controller as any).delete("e1", {}, {});
    expect(repos.event.delete).toHaveBeenCalledWith("c1", "e1");
    expect(repos.eventBooking.deleteForEvent).toHaveBeenCalledWith("c1", "e1");
  });

  it("rejects self-cancel once the request is no longer pending", async () => {
    const { controller, repos } = makeController({ personId: "p1", event: { id: "e1", requestedBy: "p1", approvalStatus: "approved" } });
    const result = await (controller as any).delete("e1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.event.delete).not.toHaveBeenCalled();
  });

  it("rejects cancelling someone else's pending request", async () => {
    const { controller, repos } = makeController({ personId: "p2", event: { id: "e1", requestedBy: "p1", approvalStatus: "pending" } });
    const result = await (controller as any).delete("e1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.event.delete).not.toHaveBeenCalled();
  });

  it("still lets staff with content.edit delete any event", async () => {
    const { controller, repos } = makeController({ personId: "p9", access: ["contentEdit"], event: { id: "e1", requestedBy: "p1", approvalStatus: "approved" } });
    await (controller as any).delete("e1", {}, {});
    expect(repos.event.delete).toHaveBeenCalledWith("c1", "e1");
  });
});
