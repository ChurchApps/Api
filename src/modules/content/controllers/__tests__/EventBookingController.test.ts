import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" }, calendars: { admin: "calendarsAdmin" } } }));
jest.mock("../../helpers/ApprovalHelper", () => ({ ApprovalHelper: { determineStatus: jest.fn(() => "pending") } }));
jest.mock("../../helpers/ConflictHelper", () => ({ ConflictHelper: { findConflicts: jest.fn() } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadGroupMembersForPerson: jest.fn(async () => [{ groupId: "approvers" }]) }) }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));

import { EventBookingController } from "../EventBookingController.js";

function makeController(opts: any = {}) {
  const event = { id: "e1", churchId: "c1", groupId: "g1", title: "Women's Bible Study", visibility: "private", ...opts.event };
  const bookings: Record<string, any> = { b1: { id: "b1", churchId: "c1", eventId: "e1", roomId: "r1", status: "pending" }, b2: { id: "b2", churchId: "c1", eventId: "e1", roomId: "r2", status: "pending" } };
  const curatedEvents: any[] = [...(opts.curatedEvents ?? [])];
  const repos: any = {
    eventBooking: {
      load: jest.fn(async (_c: string, id: string) => bookings[id]),
      save: jest.fn(async (b: any) => b)
    },
    event: {
      load: jest.fn(async () => event),
      save: jest.fn(async (e: any) => e)
    },
    room: { load: jest.fn(async () => ({ id: "r1", name: "Fellowship Hall", approvalGroupId: "approvers" })) },
    resource: { load: jest.fn(async () => undefined) },
    curatedCalendar: { load: jest.fn(async (_c: string, id: string) => (id === "cal1" ? { id: "cal1", churchId: "c1", name: "Church Calendar" } : undefined)) },
    curatedEvent: {
      loadByCuratedCalendarId: jest.fn(async (_c: string, calId: string) => curatedEvents.filter((ce) => ce.curatedCalendarId === calId)),
      save: jest.fn(async (ce: any) => { curatedEvents.push(ce); return ce; })
    }
  };
  const au = { churchId: "c1", personId: "p1", checkAccess: (perm: any) => (opts.access ?? ["contentEdit"]).includes(perm) };
  const controller = new EventBookingController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos, event, curatedEvents };
}

describe("EventBookingController.approve publish (#1116)", () => {
  it("approves without a body exactly as before", async () => {
    const { controller, repos } = makeController();
    const result = await (controller as any).approve("b1", { body: {} }, {});
    expect(result.status).toBe("approved");
    expect(repos.event.save).not.toHaveBeenCalled();
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
  });

  it("makes the booking's event public when publish is set", async () => {
    const { controller, repos, event } = makeController();
    await (controller as any).approve("b1", { body: { publish: true } }, {});
    expect(repos.event.save).toHaveBeenCalledWith(expect.objectContaining({ id: "e1", visibility: "public" }));
    expect(event.visibility).toBe("public");
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
  });

  it("adds the event to the chosen curated calendar only once across bookings", async () => {
    const { controller, repos, curatedEvents } = makeController();
    await (controller as any).approve("b1", { body: { publish: true, curatedCalendarId: "cal1" } }, {});
    await (controller as any).approve("b2", { body: { publish: true, curatedCalendarId: "cal1" } }, {});
    expect(repos.curatedEvent.save).toHaveBeenCalledTimes(1);
    expect(curatedEvents).toEqual([{ churchId: "c1", curatedCalendarId: "cal1", groupId: "g1", eventId: "e1" }]);
  });

  it("skips the curated row when the event's whole group is already on the calendar", async () => {
    const { controller, repos } = makeController({ curatedEvents: [{ id: "ce1", churchId: "c1", curatedCalendarId: "cal1", groupId: "g1", eventId: null }] });
    await (controller as any).approve("b1", { body: { publish: true, curatedCalendarId: "cal1" } }, {});
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
  });

  it("returns 400 for a curated calendar outside the church", async () => {
    const { controller, repos } = makeController();
    const result = await (controller as any).approve("b1", { body: { publish: true, curatedCalendarId: "other" } }, {});
    expect(result.status).toBe(400);
    expect(repos.eventBooking.save).not.toHaveBeenCalled();
  });

  it("returns 401 for a curated calendar without content.edit", async () => {
    const { controller, repos } = makeController({ access: ["calendarsAdmin"] });
    const result = await (controller as any).approve("b1", { body: { publish: true, curatedCalendarId: "cal1" } }, {});
    expect(result.status).toBe(401);
    expect(repos.eventBooking.save).not.toHaveBeenCalled();
  });

  it("returns 401 when an approval-group member tries to publish", async () => {
    const { controller, repos } = makeController({ access: [] });
    const result = await (controller as any).approve("b1", { body: { publish: true } }, {});
    expect(result.status).toBe(401);
    expect(repos.eventBooking.save).not.toHaveBeenCalled();
  });

  it("still lets an approval-group member approve without publishing", async () => {
    const { controller, repos } = makeController({ access: [] });
    const result = await (controller as any).approve("b1", { body: {} }, {});
    expect(result.status).toBe("approved");
    expect(repos.event.save).not.toHaveBeenCalled();
  });

  it("ignores publish on reject", async () => {
    const { controller, repos } = makeController();
    const result = await (controller as any).reject("b1", { body: { publish: true, curatedCalendarId: "cal1" } }, {});
    expect(result.status).toBe("rejected");
    expect(repos.event.save).not.toHaveBeenCalled();
    expect(repos.curatedEvent.save).not.toHaveBeenCalled();
  });
});
