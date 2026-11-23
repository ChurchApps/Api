import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
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
const mockLoadPerson = jest.fn(async (_churchId: string, personId: string): Promise<{ id: string } | null> => (personId === "p5" ? { id: "p5" } : null));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadGroupMembersForPerson: jest.fn(async (): Promise<{ groupId: string }[]> => []), loadPerson: mockLoadPerson }) }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));

import { EventController } from "../EventController.js";
import { Event, EventBooking } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
type BookingRow = EventBooking & { roomName?: string };

interface ControllerOpts {
  event?: Event;
  requests?: Event[];
  resolved?: Event[];
  bookings?: BookingRow[];
  personId?: string;
  access?: string[];
}

function makeController(opts: ControllerOpts = {}) {
  const repos = {
    event: {
      load: jest.fn(async () => opts.event),
      loadRequestsForPerson: jest.fn(async () => opts.requests ?? []),
      loadResolved: jest.fn(async () => opts.resolved ?? []),
      delete: jest.fn(async (): Promise<undefined> => undefined),
      save: jest.fn(async (e: Event) => e)
    },
    eventBooking: {
      loadForEvent: jest.fn(async () => opts.bookings ?? []),
      setRequestedByForEvent: jest.fn(async (_c: string, _e: string, personId: string) => (opts.bookings ?? []).forEach((b) => (b.requestedBy = personId))),
      deleteForEvent: jest.fn(async (): Promise<undefined> => undefined)
    }
  };
  const au = { churchId: "c1", personId: opts.personId ?? "p1", checkAccess: (perm: string) => (opts.access ?? []).includes(perm) };
  const controller = new EventController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("EventController.getMyRequests (CA-1)", () => {
  it("returns only the caller's requests with their bookings", async () => {
    const { controller, repos } = makeController({ requests: [{ id: "e1", title: "Retreat", requestedBy: "p1" }], bookings: [{ id: "b1", status: "pending" }] });
    const result = await controller.getMyRequests({} as express.Request, {} as express.Response);
    expect(repos.event.loadRequestsForPerson).toHaveBeenCalledWith("c1", "p1");
    expect((result as Event[])[0]).toMatchObject({ id: "e1", bookings: [{ id: "b1", status: "pending" }] });
  });
});

describe("EventController.delete self-cancel guard (CA-1)", () => {
  it("lets the requester cancel their own pending request", async () => {
    const { controller, repos } = makeController({ personId: "p1", event: { id: "e1", requestedBy: "p1", approvalStatus: "pending" } });
    await controller.delete("e1", {} as express.Request, {} as express.Response);
    expect(repos.event.delete).toHaveBeenCalledWith("c1", "e1");
    expect(repos.eventBooking.deleteForEvent).toHaveBeenCalledWith("c1", "e1");
  });

  it("rejects self-cancel once the request is no longer pending", async () => {
    const { controller, repos } = makeController({ personId: "p1", event: { id: "e1", requestedBy: "p1", approvalStatus: "approved" } });
    const result = await controller.delete("e1", {} as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.event.delete).not.toHaveBeenCalled();
  });

  it("rejects cancelling someone else's pending request", async () => {
    const { controller, repos } = makeController({ personId: "p2", event: { id: "e1", requestedBy: "p1", approvalStatus: "pending" } });
    const result = await controller.delete("e1", {} as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.event.delete).not.toHaveBeenCalled();
  });

  it("still lets staff with content.edit delete any event", async () => {
    const { controller, repos } = makeController({ personId: "p9", access: ["contentEdit"], event: { id: "e1", requestedBy: "p1", approvalStatus: "approved" } });
    await controller.delete("e1", {} as express.Request, {} as express.Response);
    expect(repos.event.delete).toHaveBeenCalledWith("c1", "e1");
  });
});

describe("EventController.request hardening (M28)", () => {
  it("rejects anonymous requests", async () => {
    const { controller, repos } = makeController({ personId: "" });
    repos.event.save = jest.fn();
    const result = await controller.request({ body: { title: "x" } } as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.event.save).not.toHaveBeenCalled();
  });

  it("drops a groupId the requester is not in and caps field lengths", async () => {
    const { controller, repos } = makeController();
    repos.event.save = jest.fn(async (e: Event) => ({ ...e, id: "e1" }));
    await controller.request({ body: { title: "t".repeat(400), groupId: "foreign" } } as express.Request, {} as express.Response);
    const saved = repos.event.save.mock.calls[0][0];
    expect(saved.groupId).toBeUndefined();
    expect(saved.title.length).toBe(255);
  });
});

describe("EventController.getResolved (#1488)", () => {
  it("returns decided event requests to calendar admins", async () => {
    const { controller, repos } = makeController({ access: ["calendarsAdmin"], resolved: [{ id: "e2", approvalStatus: "approved" }] });
    const result = await controller.getResolved({} as express.Request, {} as express.Response);
    expect(repos.event.loadResolved).toHaveBeenCalledWith("c1");
    expect(result).toEqual([{ id: "e2", approvalStatus: "approved" }]);
  });

  it("returns 401 without content edit or calendars admin", async () => {
    const { controller, repos } = makeController({ access: [] });
    const result = await controller.getResolved({} as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.event.loadResolved).not.toHaveBeenCalled();
  });
});

describe("EventController.getRequestsForPerson (#1476)", () => {
  it("returns a person's requests with their bookings to calendar admins", async () => {
    const { controller, repos } = makeController({ access: ["calendarsAdmin"], requests: [{ id: "e1", title: "Retreat", requestedBy: "p7" }], bookings: [{ id: "b1", status: "approved", roomName: "Sanctuary" }] });
    const result = await controller.getRequestsForPerson("p7", {} as express.Request, {} as express.Response);
    expect(repos.event.loadRequestsForPerson).toHaveBeenCalledWith("c1", "p7");
    expect(repos.eventBooking.loadForEvent).toHaveBeenCalledWith("c1", "e1");
    expect(result).toEqual([{ id: "e1", title: "Retreat", requestedBy: "p7", bookings: [{ id: "b1", status: "approved", roomName: "Sanctuary" }] }]);
  });

  it("lets content editors see a person's requests", async () => {
    const { controller, repos } = makeController({ access: ["contentEdit"], requests: [] });
    const result = await controller.getRequestsForPerson("p7", {} as express.Request, {} as express.Response);
    expect(repos.event.loadRequestsForPerson).toHaveBeenCalledWith("c1", "p7");
    expect(result).toEqual([]);
  });

  it("returns 401 without content edit or calendars admin, even for someone else's id", async () => {
    const { controller, repos } = makeController({ access: [], personId: "p1" });
    const result = await controller.getRequestsForPerson("p7", {} as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.event.loadRequestsForPerson).not.toHaveBeenCalled();
  });
});

describe("EventController.setRequester (#1603)", () => {
  it("returns 401 without content edit or calendars admin", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", requestedBy: "p1", approvalStatus: "pending" } });
    const result = await controller.setRequester("e1", { body: { personId: "p5" } } as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.event.save).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown event", async () => {
    const { controller } = makeController({ access: ["calendarsAdmin"] });
    const result = await controller.setRequester("e9", { body: { personId: "p5" } } as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(404);
  });

  it("returns 400 for a person outside the church", async () => {
    const { controller, repos } = makeController({ access: ["calendarsAdmin"], event: { id: "e1", requestedBy: "p1", approvalStatus: "pending" } });
    const result = await controller.setRequester("e1", { body: { personId: "p404" } } as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(400);
    expect(repos.event.save).not.toHaveBeenCalled();
    expect(repos.eventBooking.setRequestedByForEvent).not.toHaveBeenCalled();
  });

  it("moves a pending request and every booking on it to the new person", async () => {
    const { controller, repos } = makeController({
      access: ["contentEdit"],
      event: { id: "e1", requestedBy: "p1", approvalStatus: "pending" },
      bookings: [{ id: "b1", eventId: "e1", requestedBy: "p1" }, { id: "b2", eventId: "e1", requestedBy: "p1" }]
    });
    const result = await controller.setRequester("e1", { body: { personId: "p5" } } as express.Request, {} as express.Response);
    expect(repos.event.save).toHaveBeenCalledWith(expect.objectContaining({ id: "e1", requestedBy: "p5", approvalStatus: "pending" }));
    expect(repos.eventBooking.setRequestedByForEvent).toHaveBeenCalledWith("c1", "e1", "p5");
    const moved = result as { event: Event; bookings: EventBooking[] };
    expect(moved.event.requestedBy).toBe("p5");
    expect(moved.bookings.map((b) => b.requestedBy)).toEqual(["p5", "p5"]);
  });

  it("moves the bookings of a staff-created event but leaves the event itself alone", async () => {
    const { controller, repos } = makeController({
      access: ["calendarsAdmin"],
      event: { id: "e1", requestedBy: "p1" },
      bookings: [{ id: "b1", eventId: "e1", requestedBy: "p1" }]
    });
    await controller.setRequester("e1", { body: { personId: "p5" } } as express.Request, {} as express.Response);
    expect(repos.event.save).not.toHaveBeenCalled();
    expect(repos.eventBooking.setRequestedByForEvent).toHaveBeenCalledWith("c1", "e1", "p5");
  });
});
