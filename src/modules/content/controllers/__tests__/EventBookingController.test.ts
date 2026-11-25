import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" }, calendars: { admin: "calendarsAdmin" } } }));
jest.mock("../../helpers/ApprovalHelper", () => ({ ApprovalHelper: { determineStatus: jest.fn(() => "pending") } }));
jest.mock("../../helpers/ConflictHelper", () => ({ ConflictHelper: { findConflicts: jest.fn() } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadGroupMembersForPerson: jest.fn(async () => [{ groupId: "approvers" }]) }) }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));

import { EventBookingController } from "../EventBookingController.js";
import { CuratedEvent, Event, EventBooking } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
type ResolvedBooking = EventBooking & { roomApprovalGroupId?: string; resourceApprovalGroupId?: string };

interface ControllerOpts {
  event?: Partial<Event>;
  curatedEvents?: CuratedEvent[];
  resolved?: ResolvedBooking[];
  access?: string[];
}

function makeController(opts: ControllerOpts = {}) {
  const event: Event = { id: "e1", churchId: "c1", groupId: "g1", title: "Women's Bible Study", visibility: "private", ...opts.event };
  const bookings: Record<string, EventBooking> = { b1: { id: "b1", churchId: "c1", eventId: "e1", roomId: "r1", status: "pending" }, b2: { id: "b2", churchId: "c1", eventId: "e1", roomId: "r2", status: "pending" } };
  const curatedEvents: CuratedEvent[] = [...(opts.curatedEvents ?? [])];
  const repos = {
    eventBooking: {
      load: jest.fn(async (_c: string, id: string) => bookings[id]),
      save: jest.fn(async (b: EventBooking) => b),
      loadResolved: jest.fn(async () => (opts.resolved ?? []).map((r) => ({ ...r })))
    },
    event: {
      load: jest.fn(async () => event),
      save: jest.fn(async (e: Event) => e)
    },
    room: { load: jest.fn(async () => ({ id: "r1", name: "Fellowship Hall", approvalGroupId: "approvers" })) },
    resource: { load: jest.fn(async (): Promise<undefined> => undefined) },
    curatedCalendar: { load: jest.fn(async (_c: string, id: string) => (id === "cal1" ? { id: "cal1", churchId: "c1", name: "Church Calendar" } : undefined)) },
    curatedEvent: {
      loadByCuratedCalendarId: jest.fn(async (_c: string, calId: string) => curatedEvents.filter((ce) => ce.curatedCalendarId === calId)),
      save: jest.fn(async (ce: CuratedEvent) => { curatedEvents.push(ce); return ce; })
    }
  };
  const au = { churchId: "c1", personId: "p1", checkAccess: (perm: string) => (opts.access ?? ["contentEdit"]).includes(perm) };
  const controller = new EventBookingController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos, event, curatedEvents };
}

describe("EventBookingController.approve publish (#1116)", () => {
  it("approves without a body exactly as before", async () => {
    const { controller, repos } = makeController();
    const result = await controller.approve("b1", { body: {} } as express.Request, {} as express.Response);
    expect((result as EventBooking).status).toBe("approved");
    expect(repos.event.save).not.toHaveBeenCalled();
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
  });

  it("makes the booking's event public when publish is set", async () => {
    const { controller, repos, event } = makeController();
    await controller.approve("b1", { body: { publish: true } } as express.Request, {} as express.Response);
    expect(repos.event.save).toHaveBeenCalledWith(expect.objectContaining({ id: "e1", visibility: "public" }));
    expect(event.visibility).toBe("public");
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
  });

  it("adds the event to the chosen curated calendar only once across bookings", async () => {
    const { controller, repos, curatedEvents } = makeController();
    await controller.approve("b1", { body: { publish: true, curatedCalendarId: "cal1" } } as express.Request, {} as express.Response);
    await controller.approve("b2", { body: { publish: true, curatedCalendarId: "cal1" } } as express.Request, {} as express.Response);
    expect(repos.curatedEvent.save).toHaveBeenCalledTimes(1);
    expect(curatedEvents).toEqual([{ churchId: "c1", curatedCalendarId: "cal1", groupId: "g1", eventId: "e1" }]);
  });

  it("skips the curated row when the event's whole group is already on the calendar", async () => {
    const { controller, repos } = makeController({ curatedEvents: [{ id: "ce1", churchId: "c1", curatedCalendarId: "cal1", groupId: "g1", eventId: null }] });
    await controller.approve("b1", { body: { publish: true, curatedCalendarId: "cal1" } } as express.Request, {} as express.Response);
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
  });

  it("returns 400 for a curated calendar outside the church", async () => {
    const { controller, repos } = makeController();
    const result = await controller.approve("b1", { body: { publish: true, curatedCalendarId: "other" } } as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(400);
    expect(repos.eventBooking.save).not.toHaveBeenCalled();
  });

  it("returns 401 for a curated calendar without content.edit", async () => {
    const { controller, repos } = makeController({ access: ["calendarsAdmin"] });
    const result = await controller.approve("b1", { body: { publish: true, curatedCalendarId: "cal1" } } as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.eventBooking.save).not.toHaveBeenCalled();
  });

  it("returns 401 when an approval-group member tries to publish", async () => {
    const { controller, repos } = makeController({ access: [] });
    const result = await controller.approve("b1", { body: { publish: true } } as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.eventBooking.save).not.toHaveBeenCalled();
  });

  it("still lets an approval-group member approve without publishing", async () => {
    const { controller, repos } = makeController({ access: [] });
    const result = await controller.approve("b1", { body: {} } as express.Request, {} as express.Response);
    expect((result as EventBooking).status).toBe("approved");
    expect(repos.event.save).not.toHaveBeenCalled();
  });

  it("ignores publish on reject", async () => {
    const { controller, repos } = makeController();
    const result = await controller.reject("b1", { body: { publish: true, curatedCalendarId: "cal1" } } as express.Request, {} as express.Response);
    expect((result as EventBooking).status).toBe("rejected");
    expect(repos.event.save).not.toHaveBeenCalled();
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
  });
});

describe("EventBookingController.getResolved (#1488)", () => {
  const resolved = [
    { id: "b3", roomId: "r1", roomApprovalGroupId: "approvers", status: "approved", requestedBy: "p2", resolvedBy: "p1" },
    { id: "b4", resourceId: "x1", resourceApprovalGroupId: "facilities", status: "rejected", requestedBy: "p3", resolvedBy: "p9" }
  ];

  it("returns every decided booking to a resolver without computing conflicts", async () => {
    const { controller, repos } = makeController({ resolved });
    const result = await controller.getResolved({} as express.Request, {} as express.Response);
    expect(repos.eventBooking.loadResolved).toHaveBeenCalledWith("c1");
    expect((result as EventBooking[]).map((r) => r.id)).toEqual(["b3", "b4"]);
    expect((result as EventBooking[])[0]).not.toHaveProperty("conflicts");
  });

  it("limits an approval-group member to their own groups' bookings", async () => {
    const { controller } = makeController({ resolved, access: [] });
    const result = await controller.getResolved({} as express.Request, {} as express.Response);
    expect((result as EventBooking[]).map((r) => r.id)).toEqual(["b3"]);
  });
});
