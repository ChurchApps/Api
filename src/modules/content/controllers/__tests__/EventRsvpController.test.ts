import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { groups: { edit: "groupsEdit" } } }));

import { EventRsvpController } from "../EventRsvpController.js";
import { Event, EventRsvp } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
type RsvpRow = { eventId: string; occurrenceStart: string; personId: string; response: string };
interface Opts {
  event?: Event;
  roster?: Partial<EventRsvp>[];
  window?: RsvpRow[];
  personId?: string;
  groupIds?: string[];
  leaderGroupIds?: string[];
  access?: string[];
}

const res = {} as express.Response;

function makeController(opts: Opts = {}) {
  const repos = {
    event: { load: jest.fn(async () => opts.event) },
    eventRsvp: {
      save: jest.fn(async (m: EventRsvp) => ({ ...m, id: "R1" })),
      deleteOwn: jest.fn(async (): Promise<void> => undefined),
      loadForOccurrence: jest.fn(async () => opts.roster ?? []),
      loadForGroupWindow: jest.fn(async () => opts.window ?? [])
    }
  };
  const au = {
    churchId: "c1",
    personId: opts.personId ?? "p1",
    groupIds: opts.groupIds ?? [],
    leaderGroupIds: opts.leaderGroupIds ?? [],
    checkAccess: (perm: string) => (opts.access ?? []).includes(perm)
  };
  const controller = new EventRsvpController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("EventRsvpController.setRsvp authz", () => {
  const req = { body: { occurrenceStart: "2026-08-02T09:00:00Z", response: "yes" } } as express.Request;

  it("member of the group can set a response", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1" }, groupIds: ["g1"] });
    const result = await controller.setRsvp("e1", req, res);
    expect(repos.eventRsvp.save).toHaveBeenCalled();
    expect((result as EventRsvp).id).toBe("R1");
  });

  it("non-member is rejected 401", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1" }, groupIds: ["other"] });
    const result = await controller.setRsvp("e1", req, res);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.eventRsvp.save).not.toHaveBeenCalled();
  });

  it("rejects 400 when RSVP is disabled", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1", rsvpDisabled: true }, groupIds: ["g1"] });
    const result = await controller.setRsvp("e1", req, res);
    expect((result as JsonResult).status).toBe(400);
    expect(repos.eventRsvp.save).not.toHaveBeenCalled();
  });

  it("rejects 401 when the event has no group", async () => {
    const { controller } = makeController({ event: { id: "e1", groupId: null }, groupIds: ["g1"] });
    const result = await controller.setRsvp("e1", req, res);
    expect((result as JsonResult).status).toBe(401);
  });
});

describe("EventRsvpController.getRoster authz", () => {
  const query: express.Request["query"] = { occurrenceStart: "2026-08-02T09:00:00Z" };
  const req = { query } as express.Request;

  it("group leader can view the roster", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1" }, leaderGroupIds: ["g1"], roster: [{ personId: "p2", response: "yes" }] });
    const result = await controller.getRoster("e1", req, res);
    expect(repos.eventRsvp.loadForOccurrence).toHaveBeenCalled();
    expect(result).toEqual([{ personId: "p2", response: "yes" }]);
  });

  it("staff with groups.edit can view the roster", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1" }, access: ["groupsEdit"] });
    await controller.getRoster("e1", req, res);
    expect(repos.eventRsvp.loadForOccurrence).toHaveBeenCalled();
  });

  it("a plain member (non-leader, non-staff) is rejected 401", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1" }, groupIds: ["g1"] });
    const result = await controller.getRoster("e1", req, res);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.eventRsvp.loadForOccurrence).not.toHaveBeenCalled();
  });
});

describe("EventRsvpController.getGroupBatch", () => {
  it("aggregates counts and the caller's own response; rejects non-members", async () => {
    const occ = "2026-08-02T09:00:00.000Z";
    const window = [
      { eventId: "e1", occurrenceStart: occ, personId: "p1", response: "yes" },
      { eventId: "e1", occurrenceStart: occ, personId: "p2", response: "yes" },
      { eventId: "e1", occurrenceStart: occ, personId: "p3", response: "no" }
    ];
    const { controller } = makeController({ groupIds: ["g1"], personId: "p1", window });
    const result = await controller.getGroupBatch("g1", { query: {} } as express.Request, res);
    expect(result).toHaveLength(1);
    expect((result as Record<string, unknown>[])[0]).toMatchObject({ eventId: "e1", yes: 2, no: 1, maybe: 0, mine: "yes" });

    const denied = makeController({ groupIds: ["other"], personId: "p1", window });
    const r2 = await denied.controller.getGroupBatch("g1", { query: {} } as express.Request, res);
    expect((r2 as JsonResult).status).toBe(401);
  });
});
