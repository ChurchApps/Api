import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("ics", () => ({ createEvents: jest.fn() }));
jest.mock("../../helpers/index", () => ({
  CalendarHelper: { addExceptionDates: jest.fn(async (events: { exceptionDates?: string[] }[]) => events.forEach((e) => { e.exceptionDates = ["2026-10-25"]; })) },
  HolidayHelper: { getHolidays: jest.fn() },
  Permissions: { content: { edit: "contentEdit" }, calendars: { admin: "calendarsAdmin" } }
}));
jest.mock("../../helpers/ApprovalHelper", () => ({ ApprovalHelper: { determineStatus: jest.fn(() => "pending") } }));
jest.mock("../../helpers/ConflictHelper", () => ({ ConflictHelper: { findConflicts: jest.fn() } }));
jest.mock("../../helpers/IcsHelper", () => ({ IcsHelper: { parseEvents: jest.fn() } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
const mockGateway = { loadGroupMembersForPerson: jest.fn(async (): Promise<unknown[]> => []), loadActiveGroupIds: jest.fn(async (_c: string, ids: string[]) => ids) };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => mockGateway }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));

import { EventController } from "../EventController.js";
import { EventExceptionController } from "../EventExceptionController.js";
import { Event, EventException } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
type Repos = ReturnType<typeof makeRepos>;
interface WireOpts { leaderGroupIds?: string[]; access?: string[] }

const res = {} as express.Response;
const emptyQuery = { query: {} } as express.Request;
const noReq = {} as express.Request;
const exceptionReq = (eventId: string) => ({ body: [{ eventId, exceptionDate: "2026-10-25" }] } as express.Request);
const ids = (result: unknown) => (result as Event[]).map((e) => e.id);
const statusOf = (result: unknown) => (result as JsonResult).status;

const groupEvent = { id: "e1", churchId: "c1", groupId: "g1", recurrenceRule: "FREQ=WEEKLY" };

function makeRepos() {
  return {
    event: {
      load: jest.fn(async (_c: string, id: string) => (id === "e1" ? { ...groupEvent } : undefined)),
      loadTimeline: jest.fn(async (): Promise<Event[]> => [{ ...groupEvent }]),
      loadTimelineGroup: jest.fn(async (): Promise<Event[]> => [{ ...groupEvent }]),
      delete: jest.fn(async (): Promise<void> => undefined)
    },
    eventBooking: { deleteForEvent: jest.fn(async (): Promise<void> => undefined) },
    eventException: {
      load: jest.fn(async () => ({ id: "x1", churchId: "c1", eventId: "e1" })),
      save: jest.fn(async (x: EventException) => ({ ...x, id: "x1" })),
      delete: jest.fn(async (): Promise<void> => undefined)
    }
  };
}

function wire<T extends EventController | EventExceptionController>(controller: T, repos: Repos, opts: WireOpts = {}) {
  const au = { churchId: "c1", personId: "p1", groupIds: ["g1"], leaderGroupIds: opts.leaderGroupIds ?? [], checkAccess: (perm: string) => (opts.access ?? []).includes(perm) };
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return controller;
}

describe("issue 1321: Me page timeline carries deleted occurrences", () => {
  it("GET /timeline includes exceptionDates", async () => {
    const c = wire(new EventController(), makeRepos());
    const result = await c.getPosts(emptyQuery, res);
    expect((result as Event[])[0].exceptionDates).toEqual(["2026-10-25"]);
  });

  it("GET /timeline/group/:groupId includes exceptionDates", async () => {
    const c = wire(new EventController(), makeRepos());
    const result = await c.getPostsForGroup("g1", emptyQuery, res);
    expect((result as Event[])[0].exceptionDates).toEqual(["2026-10-25"]);
  });
});

describe("issue 1324: Me page timeline hides events of a deleted group", () => {
  const removedEvent = { id: "e2", churchId: "c1", groupId: "gRemoved" };
  const churchEvent = { id: "e3", churchId: "c1" };

  function timelineRepos() {
    const repos = makeRepos();
    const rows = () => [{ ...groupEvent }, { ...removedEvent }, { ...churchEvent }];
    repos.event.loadTimeline = jest.fn(async (): Promise<Event[]> => rows());
    repos.event.loadTimelineGroup = jest.fn(async (): Promise<Event[]> => rows());
    return repos;
  }

  beforeEach(() => mockGateway.loadActiveGroupIds.mockImplementation(async (_c: string, ids: string[]) => ids.filter((id) => id !== "gRemoved")));
  afterEach(() => mockGateway.loadActiveGroupIds.mockImplementation(async (_c: string, ids: string[]) => ids));

  it("GET /timeline drops the removed group's event and keeps active-group and church events", async () => {
    const c = wire(new EventController(), timelineRepos());
    const result = await c.getPosts(emptyQuery, res);
    expect(ids(result)).toEqual(["e1", "e3"]);
    expect(mockGateway.loadActiveGroupIds).toHaveBeenCalledWith("c1", ["g1", "gRemoved"]);
  });

  it("GET /timeline/group/:groupId drops the removed group's event", async () => {
    const c = wire(new EventController(), timelineRepos());
    const result = await c.getPostsForGroup("g1", emptyQuery, res);
    expect(ids(result)).toEqual(["e1", "e3"]);
  });

  it("keeps only groupless events when no group is active", async () => {
    mockGateway.loadActiveGroupIds.mockImplementation(async () => []);
    const c = wire(new EventController(), timelineRepos());
    const result = await c.getPosts(emptyQuery, res);
    expect(ids(result)).toEqual(["e3"]);
  });

  it("skips the group lookup when the timeline is empty", async () => {
    mockGateway.loadActiveGroupIds.mockClear();
    const repos = makeRepos();
    repos.event.loadTimeline = jest.fn(async (): Promise<Event[]> => []);
    const c = wire(new EventController(), repos);
    expect(await c.getPosts(emptyQuery, res)).toEqual([]);
    expect(mockGateway.loadActiveGroupIds).not.toHaveBeenCalled();
  });
});

describe("issue 1321: group leaders can delete their group's events", () => {
  it("leader of the event's group can delete the event", async () => {
    const repos = makeRepos();
    const c = wire(new EventController(), repos, { leaderGroupIds: ["g1"] });
    const result = await c.delete("e1", noReq, res);
    expect(statusOf(result)).toBeUndefined();
    expect(repos.event.delete).toHaveBeenCalledWith("c1", "e1");
  });

  it("calendar admin can delete the event", async () => {
    const repos = makeRepos();
    const c = wire(new EventController(), repos, { access: ["calendarsAdmin"] });
    await c.delete("e1", noReq, res);
    expect(repos.event.delete).toHaveBeenCalledWith("c1", "e1");
  });

  it("leader of a different group cannot delete the event", async () => {
    const repos = makeRepos();
    const c = wire(new EventController(), repos, { leaderGroupIds: ["g2"] });
    const result = await c.delete("e1", noReq, res);
    expect(statusOf(result)).toBe(401);
    expect(repos.event.delete).not.toHaveBeenCalled();
  });

  it("leader of the event's group can delete one occurrence", async () => {
    const repos = makeRepos();
    const c = wire(new EventExceptionController(), repos, { leaderGroupIds: ["g1"] });
    const result = await c.save(exceptionReq("e1"), res);
    expect(statusOf(result)).toBeUndefined();
    expect(repos.eventException.save).toHaveBeenCalled();
  });

  it("leader of the event's group can restore an occurrence", async () => {
    const repos = makeRepos();
    const c = wire(new EventExceptionController(), repos, { leaderGroupIds: ["g1"] });
    await c.delete("x1", noReq, res);
    expect(repos.eventException.delete).toHaveBeenCalledWith("c1", "x1");
  });

  it("leader of a different group cannot add or remove exceptions", async () => {
    const repos = makeRepos();
    const c = wire(new EventExceptionController(), repos, { leaderGroupIds: ["g2"] });
    expect(statusOf(await c.save(exceptionReq("e1"), res))).toBe(401);
    expect(statusOf(await c.delete("x1", noReq, res))).toBe(401);
    expect(repos.eventException.save).not.toHaveBeenCalled();
    expect(repos.eventException.delete).not.toHaveBeenCalled();
  });

  it("an exception for an unknown event is rejected for non-staff", async () => {
    const repos = makeRepos();
    const c = wire(new EventExceptionController(), repos, { leaderGroupIds: ["g1"] });
    expect(statusOf(await c.save(exceptionReq("nope"), res))).toBe(401);
  });
});
