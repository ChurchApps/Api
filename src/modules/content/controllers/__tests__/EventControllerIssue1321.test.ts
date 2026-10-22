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
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadGroupMembersForPerson: jest.fn(async () => []) }) }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));

import { EventController } from "../EventController.js";
import { EventExceptionController } from "../EventExceptionController.js";

const groupEvent = { id: "e1", churchId: "c1", groupId: "g1", recurrenceRule: "FREQ=WEEKLY" };

function makeRepos() {
  return {
    event: {
      load: jest.fn(async (_c: string, id: string) => (id === "e1" ? { ...groupEvent } : undefined)),
      loadTimeline: jest.fn(async () => [{ ...groupEvent }]),
      loadTimelineGroup: jest.fn(async () => [{ ...groupEvent }]),
      delete: jest.fn(async () => undefined)
    },
    eventBooking: { deleteForEvent: jest.fn(async () => undefined) },
    eventException: {
      load: jest.fn(async () => ({ id: "x1", churchId: "c1", eventId: "e1" })),
      save: jest.fn(async (x: any) => ({ ...x, id: "x1" })),
      delete: jest.fn(async () => undefined)
    }
  };
}

function wire(controller: any, repos: any, opts: any = {}) {
  const au = { churchId: "c1", personId: "p1", groupIds: ["g1"], leaderGroupIds: opts.leaderGroupIds ?? [], checkAccess: (perm: any) => (opts.access ?? []).includes(perm) };
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(au);
  controller.json = (obj: any, status: number) => ({ obj, status });
  return controller;
}

describe("issue 1321: Me page timeline carries deleted occurrences", () => {
  it("GET /timeline includes exceptionDates", async () => {
    const c = wire(new EventController(), makeRepos());
    const result = await c.getPosts({ query: {} }, {});
    expect(result[0].exceptionDates).toEqual(["2026-10-25"]);
  });

  it("GET /timeline/group/:groupId includes exceptionDates", async () => {
    const c = wire(new EventController(), makeRepos());
    const result = await c.getPostsForGroup("g1", { query: {} }, {});
    expect(result[0].exceptionDates).toEqual(["2026-10-25"]);
  });
});

describe("issue 1321: group leaders can delete their group's events", () => {
  it("leader of the event's group can delete the event", async () => {
    const repos = makeRepos();
    const c = wire(new EventController(), repos, { leaderGroupIds: ["g1"] });
    const result = await c.delete("e1", {}, {});
    expect(result.status).toBeUndefined();
    expect(repos.event.delete).toHaveBeenCalledWith("c1", "e1");
  });

  it("calendar admin can delete the event", async () => {
    const repos = makeRepos();
    const c = wire(new EventController(), repos, { access: ["calendarsAdmin"] });
    await c.delete("e1", {}, {});
    expect(repos.event.delete).toHaveBeenCalledWith("c1", "e1");
  });

  it("leader of a different group cannot delete the event", async () => {
    const repos = makeRepos();
    const c = wire(new EventController(), repos, { leaderGroupIds: ["g2"] });
    const result = await c.delete("e1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.event.delete).not.toHaveBeenCalled();
  });

  it("leader of the event's group can delete one occurrence", async () => {
    const repos = makeRepos();
    const c = wire(new EventExceptionController(), repos, { leaderGroupIds: ["g1"] });
    const result = await c.save({ body: [{ eventId: "e1", exceptionDate: "2026-10-25" }] }, {});
    expect(result.status).toBeUndefined();
    expect(repos.eventException.save).toHaveBeenCalled();
  });

  it("leader of the event's group can restore an occurrence", async () => {
    const repos = makeRepos();
    const c = wire(new EventExceptionController(), repos, { leaderGroupIds: ["g1"] });
    await c.delete("x1", {}, {});
    expect(repos.eventException.delete).toHaveBeenCalledWith("c1", "x1");
  });

  it("leader of a different group cannot add or remove exceptions", async () => {
    const repos = makeRepos();
    const c = wire(new EventExceptionController(), repos, { leaderGroupIds: ["g2"] });
    expect((await c.save({ body: [{ eventId: "e1", exceptionDate: "2026-10-25" }] }, {})).status).toBe(401);
    expect((await c.delete("x1", {}, {})).status).toBe(401);
    expect(repos.eventException.save).not.toHaveBeenCalled();
    expect(repos.eventException.delete).not.toHaveBeenCalled();
  });

  it("an exception for an unknown event is rejected for non-staff", async () => {
    const repos = makeRepos();
    const c = wire(new EventExceptionController(), repos, { leaderGroupIds: ["g1"] });
    expect((await c.save({ body: [{ eventId: "nope", exceptionDate: "2026-10-25" }] }, {})).status).toBe(401);
  });
});
