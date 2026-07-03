import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { groups: { edit: "groupsEdit" } } }));

import { EventRsvpController } from "../EventRsvpController.js";

function makeController(opts: any = {}) {
  const repos: any = {
    event: { load: jest.fn(async () => opts.event) },
    eventRsvp: {
      save: jest.fn(async (m: any) => ({ ...m, id: "R1" })),
      deleteOwn: jest.fn(async () => undefined),
      loadForOccurrence: jest.fn(async () => opts.roster ?? []),
      loadForGroupWindow: jest.fn(async () => opts.window ?? [])
    }
  };
  const au = {
    churchId: "c1",
    personId: opts.personId ?? "p1",
    groupIds: opts.groupIds ?? [],
    leaderGroupIds: opts.leaderGroupIds ?? [],
    checkAccess: (perm: any) => (opts.access ?? []).includes(perm)
  };
  const controller = new EventRsvpController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("EventRsvpController.setRsvp authz", () => {
  const body = { occurrenceStart: "2026-08-02T09:00:00Z", response: "yes" };

  it("member of the group can set a response", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1" }, groupIds: ["g1"] });
    const result = await (controller as any).setRsvp("e1", { body }, {});
    expect(repos.eventRsvp.save).toHaveBeenCalled();
    expect(result.id).toBe("R1");
  });

  it("non-member is rejected 401", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1" }, groupIds: ["other"] });
    const result = await (controller as any).setRsvp("e1", { body }, {});
    expect(result.status).toBe(401);
    expect(repos.eventRsvp.save).not.toHaveBeenCalled();
  });

  it("rejects 400 when RSVP is disabled", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1", rsvpDisabled: true }, groupIds: ["g1"] });
    const result = await (controller as any).setRsvp("e1", { body }, {});
    expect(result.status).toBe(400);
    expect(repos.eventRsvp.save).not.toHaveBeenCalled();
  });

  it("rejects 401 when the event has no group", async () => {
    const { controller } = makeController({ event: { id: "e1", groupId: null }, groupIds: ["g1"] });
    const result = await (controller as any).setRsvp("e1", { body }, {});
    expect(result.status).toBe(401);
  });
});

describe("EventRsvpController.getRoster authz", () => {
  const req = { query: { occurrenceStart: "2026-08-02T09:00:00Z" } };

  it("group leader can view the roster", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1" }, leaderGroupIds: ["g1"], roster: [{ personId: "p2", response: "yes" }] });
    const result = await (controller as any).getRoster("e1", req, {});
    expect(repos.eventRsvp.loadForOccurrence).toHaveBeenCalled();
    expect(result).toEqual([{ personId: "p2", response: "yes" }]);
  });

  it("staff with groups.edit can view the roster", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1" }, access: ["groupsEdit"] });
    await (controller as any).getRoster("e1", req, {});
    expect(repos.eventRsvp.loadForOccurrence).toHaveBeenCalled();
  });

  it("a plain member (non-leader, non-staff) is rejected 401", async () => {
    const { controller, repos } = makeController({ event: { id: "e1", groupId: "g1" }, groupIds: ["g1"] });
    const result = await (controller as any).getRoster("e1", req, {});
    expect(result.status).toBe(401);
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
    const result = await (controller as any).getGroupBatch("g1", { query: {} }, {});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ eventId: "e1", yes: 2, no: 1, maybe: 0, mine: "yes" });

    const denied = makeController({ groupIds: ["other"], personId: "p1", window });
    const r2 = await (denied.controller as any).getGroupBatch("g1", { query: {} }, {});
    expect(r2.status).toBe(401);
  });
});
