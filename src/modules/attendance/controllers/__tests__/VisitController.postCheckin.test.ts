import "reflect-metadata";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e", checkin: "c", view: "v" } } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../helpers/index", () => ({
  SecurityCodeHelper: { generate: () => "ABCD" },
  CheckinGateHelper: jest.requireActual("../../helpers/CheckinGateHelper").CheckinGateHelper
}));

const gateway = { loadGroupsForCheckin: jest.fn(), loadSetting: jest.fn() };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => gateway }));

import { VisitController } from "../VisitController.js";

function makeController(opts: any = {}) {
  const repos: any = {
    visit: {
      convertAllToModel: (_c: string, rows: any[]) => rows,
      convertToModel: (_c: string, row: any) => row,
      loadByServiceDatePeopleIds: jest.fn(async () => []),
      loadByCodeToday: jest.fn(async () => []),
      countActiveByGroupToday: jest.fn(async () => opts.counts ?? []),
      save: jest.fn(async (v: any) => { if (!v.id) v.id = "vis1"; return v; }),
      delete: jest.fn(),
      loadConsecutiveWeekStreaks: jest.fn(async () => ({}))
    },
    visitSession: {
      convertAllToModel: (_c: string, rows: any[]) => rows,
      loadByVisitIds: jest.fn(async () => []),
      save: jest.fn(async (v: any) => v),
      delete: jest.fn()
    },
    session: {
      loadByGroupServiceTimeDate: jest.fn(async () => ({ id: "sess1" })),
      save: jest.fn(async (s: any) => { s.id = "sess1"; return s; })
    }
  };
  gateway.loadGroupsForCheckin.mockResolvedValue(opts.groups ?? []);
  gateway.loadSetting.mockResolvedValue(opts.ratioSetting ?? null);

  const au = { churchId: "c1", id: "u1", checkAccess: () => true };
  const controller = new VisitController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

function req(body: any, ack = false) {
  return { query: { serviceId: "s1", peopleIds: "p1", checkDuplicates: "false", acknowledgeWarnings: ack ? "true" : "false" }, body };
}

const memberVisit = () => [{ personId: "p1", checkinType: "member", visitSessions: [{ session: { serviceTimeId: "st1", groupId: "g1" } }] }];

beforeEach(() => {
  (VisitController as any).cachedSessionIds = {};
  gateway.loadGroupsForCheckin.mockReset();
  gateway.loadSetting.mockReset();
});

describe("postCheckin capacity gate", () => {
  it("returns 409 capacity and saves NOTHING when the room is over capacity", async () => {
    const { controller, repos } = makeController({
      groups: [{ id: "g1", name: "Nursery", capacity: 1, checkinClosed: false }],
      counts: [{ groupId: "g1", total: 1, volunteers: 0, guests: 0 }]
    });
    const result: any = await (controller as any).postCheckin(req(memberVisit()), {});
    expect(result.status).toBe(409);
    expect(result.obj.error).toBe("capacity");
    expect(result.obj.groups[0].groupId).toBe("g1");
    expect(repos.visit.save).not.toHaveBeenCalled();
    expect(repos.visitSession.save).not.toHaveBeenCalled();
  });
});

describe("postCheckin passthrough", () => {
  it("persists checkinType and returns securityCode when the gate passes", async () => {
    const { controller, repos } = makeController({ groups: [{ id: "g1", name: "Nursery", capacity: 10, checkinClosed: false }], counts: [] });
    const result: any = await (controller as any).postCheckin(req(memberVisit()), {});
    expect(repos.visit.save).toHaveBeenCalled();
    expect(repos.visit.save.mock.calls[0][0].checkinType).toBe("member");
    expect(result.securityCode).toBe("ABCD");
  });

  it("returns the visit's existing securityCode on re-check-in instead of an unsaved fresh one", async () => {
    const { controller, repos } = makeController({ groups: [{ id: "g1", name: "Nursery", capacity: 10, checkinClosed: false }], counts: [] });
    const body = memberVisit();
    (body[0] as any).securityCode = "ZZZZ";
    const result: any = await (controller as any).postCheckin(req(body), {});
    expect(result.securityCode).toBe("ZZZZ");
    expect(repos.visit.save.mock.calls[0][0].securityCode).toBe("ZZZZ");
    expect(repos.visit.loadByCodeToday).not.toHaveBeenCalled();
  });

  it("legacy check-in with no group config saves normally", async () => {
    const { controller, repos } = makeController({ groups: [], counts: [] });
    await (controller as any).postCheckin(req(memberVisit()), {});
    expect(repos.visit.save).toHaveBeenCalled();
  });
});

describe("postCheckin session resolution", () => {
  it("awaits lazy session creation so visitSessions carry the new sessionId", async () => {
    const { controller, repos } = makeController({ groups: [], counts: [] });
    repos.session.loadByGroupServiceTimeDate = jest.fn(async () => null);
    repos.session.save = jest.fn(async (s: any) => {
      await new Promise((r) => setTimeout(r, 10));
      s.id = "sessNew";
      return s;
    });
    await (controller as any).postCheckin(req(memberVisit()), {});
    expect(repos.visitSession.save).toHaveBeenCalled();
    expect(repos.visitSession.save.mock.calls[0][0].sessionId).toBe("sessNew");
  });
});

describe("postCheckin ratio warn mode", () => {
  const ratioGroups = [{ id: "g1", name: "Nursery", checkinClosed: false, volunteerRatio: 5, minVolunteers: 1 }];

  it("returns a 409 warning (nothing saved) when unacknowledged", async () => {
    const { controller, repos } = makeController({ groups: ratioGroups, counts: [], ratioSetting: "warn" });
    const result: any = await (controller as any).postCheckin(req(memberVisit()), {});
    expect(result.status).toBe(409);
    expect(result.obj.warning).toBe(true);
    expect(repos.visit.save).not.toHaveBeenCalled();
  });

  it("proceeds when acknowledgeWarnings=true", async () => {
    const { controller, repos } = makeController({ groups: ratioGroups, counts: [], ratioSetting: "warn" });
    await (controller as any).postCheckin(req(memberVisit(), true), {});
    expect(repos.visit.save).toHaveBeenCalled();
  });

  it("block mode returns a hard 409 ratio", async () => {
    const { controller, repos } = makeController({ groups: ratioGroups, counts: [], ratioSetting: "block" });
    const result: any = await (controller as any).postCheckin(req(memberVisit()), {});
    expect(result.status).toBe(409);
    expect(result.obj.error).toBe("ratio");
    expect(repos.visit.save).not.toHaveBeenCalled();
  });
});
