import "reflect-metadata";
import type express from "express";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e", checkin: "c", view: "v" } } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../helpers/index", () => ({
  SecurityCodeHelper: { generate: () => "ABCD" },
  CheckinGateHelper: jest.requireActual("../../helpers/CheckinGateHelper").CheckinGateHelper,
  CheckinTimeZoneHelper: jest.requireActual("../../helpers/CheckinTimeZoneHelper").CheckinTimeZoneHelper
}));

const gateway = { loadPeople: jest.fn(async (_c: string, ids: string[]) => ids.filter((id) => id !== "outsider").map((id) => ({ id, displayName: id }))), loadGroupsForCheckin: jest.fn(), loadSetting: jest.fn(), loadHouseholdPeople: jest.fn(), loadChurch: jest.fn(), loadCampusTimeZones: jest.fn(async () => ({})), loadCampusTimeZone: jest.fn(async (): Promise<string | null> => null) };
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => gateway }));

import { VisitController } from "../VisitController.js";
import type { Session, ServiceTime, Visit, VisitSession } from "../../models/index.js";
import type { GateGroup } from "../../helpers/CheckinGateHelper.js";

type TestAu = { churchId: string; id: string; personId?: string; checkAccess: (perm: string) => boolean };
type CheckinResult = {
  status?: number;
  obj?: { error?: string; warning?: boolean; groups?: { groupId: string; groupName?: string; reason?: string }[] };
  securityCode?: string;
};
interface ControllerOpts {
  au?: TestAu;
  visits?: Visit[];
  visitSessions?: VisitSession[];
  sessions?: Session[];
  serviceTimes?: ServiceTime[];
  counts?: { groupId: string; total: number; volunteers: number; guests: number }[];
  groups?: GateGroup[];
  ratioSetting?: string;
  household?: { id: string }[];
}
const asReq = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

function makeController(opts: ControllerOpts = {}) {
  const repos = {
    visit: {
      convertAllToModel: (_c: string, rows: Visit[]) => rows,
      convertToModel: (_c: string, row: Visit) => row,
      loadLastLoggedDate: jest.fn(async (): Promise<Date | null> => null),
      loadByServiceDatePeopleIds: jest.fn(async (): Promise<Visit[]> => opts.visits ?? []),
      loadByCodeToday: jest.fn(async (): Promise<Visit[]> => []),
      countActiveByGroupToday: jest.fn(async () => opts.counts ?? []),
      save: jest.fn(async (v: Visit) => { if (!v.id) v.id = "vis1"; return v; }),
      delete: jest.fn(),
      loadConsecutiveWeekStreaks: jest.fn(async () => ({}))
    },
    visitSession: {
      convertAllToModel: (_c: string, rows: VisitSession[]) => rows,
      loadByVisitIds: jest.fn(async () => opts.visitSessions ?? []),
      save: jest.fn(async (v: VisitSession) => v),
      delete: jest.fn()
    },
    serviceTime: { loadByIds: jest.fn(async () => opts.serviceTimes ?? []) },
    service: { loadAll: jest.fn(async (): Promise<{ id: string; campusId?: string | null }[]> => []) },
    session: {
      convertAllToModel: (_c: string, rows: Session[]) => rows,
      loadByIds: jest.fn(async () => opts.sessions ?? []),
      loadByGroupServiceTimeDate: jest.fn(async (): Promise<Session | null> => ({ id: "sess1" })),
      save: jest.fn(async (s: Session) => { s.id = "sess1"; return s; })
    }
  };
  gateway.loadGroupsForCheckin.mockResolvedValue(opts.groups ?? []);
  gateway.loadSetting.mockResolvedValue(opts.ratioSetting ?? null);
  gateway.loadHouseholdPeople.mockResolvedValue(opts.household ?? [{ id: "p1" }]);
  gateway.loadChurch.mockResolvedValue({ id: "c1", timeZone: "America/Chicago" });

  const au: TestAu = opts.au ?? { churchId: "c1", id: "u1", checkAccess: () => true };
  const controller = Object.assign(new VisitController(), {
    repos,
    actionWrapper: (_req: unknown, _res: unknown, action: (user: TestAu) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

// Stands in for a test's own user in place of the one makeController was given.
const actAs = (controller: VisitController, au: TestAu) =>
  Object.assign(controller, { actionWrapper: (_req: unknown, _res: unknown, action: (user: TestAu) => Promise<unknown>) => action(au) });

function req(body: Visit[] | null, ack = false) {
  return asReq({ query: { serviceId: "s1", peopleIds: "p1", checkDuplicates: "false", acknowledgeWarnings: ack ? "true" : "false" }, body });
}

const memberVisit = (): Visit[] => [{ personId: "p1", checkinType: "member", visitSessions: [{ session: { serviceTimeId: "st1", groupId: "g1" } }] }];

beforeEach(() => {
  gateway.loadGroupsForCheckin.mockReset();
  gateway.loadSetting.mockReset();
  gateway.loadHouseholdPeople.mockReset();
  gateway.loadChurch.mockReset();
});

// ChurchAppsSupport#1426: removing Check-in from Everyone must leave family self check-in working.
describe("self check-in without the Check-in permission", () => {
  const member = { churchId: "c1", id: "u1", personId: "p1", checkAccess: () => false };

  it("saves a check-in for the caller's own household", async () => {
    const { controller, repos } = makeController({ au: member });
    await controller.postCheckin(req(memberVisit()), res);
    expect(repos.visit.save).toHaveBeenCalled();
  });

  it("refuses a check-in for someone outside the household", async () => {
    const { controller, repos } = makeController({ au: member, household: [{ id: "p1" }] });
    const result = (await controller.postCheckin(asReq({ ...req(memberVisit()), query: { serviceId: "s1", peopleIds: "p2" } }), res)) as CheckinResult;
    expect(result.status).toBe(403);
    expect(repos.visit.save).not.toHaveBeenCalled();
  });
});

describe("postCheckin capacity gate", () => {
  it("returns 409 capacity and saves NOTHING when the room is over capacity", async () => {
    const { controller, repos } = makeController({
      groups: [{ id: "g1", name: "Nursery", capacity: 1, checkinClosed: false }],
      counts: [{ groupId: "g1", total: 1, volunteers: 0, guests: 0 }]
    });
    const result = (await controller.postCheckin(req(memberVisit()), res)) as CheckinResult;
    expect(result.status).toBe(409);
    expect(result.obj.error).toBe("capacity");
    expect(result.obj.groups[0].groupId).toBe("g1");
    expect(repos.visit.save).not.toHaveBeenCalled();
    expect(repos.visitSession.save).not.toHaveBeenCalled();
  });
});

describe("postCheckin service time window", () => {
  afterEach(() => jest.useRealTimers());
  // Sunday 9:00 AM service; check-in opens 30 min before and closes 15 min after the 10:15 end.
  const sunday9 = { id: "st1", dayOfWeek: 0, startTime: "09:00:00", endTime: "10:15:00", checkinOpenMinutes: 30, checkinCloseMinutes: 15 };
  const groups = [{ id: "g1", name: "Nursery", checkinClosed: false }];

  it("returns 409 notOpen and saves NOTHING outside the check-in window", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-13T09:00:00-05:00"), doNotFake: ["setTimeout", "nextTick", "setImmediate"] });
    const { controller, repos } = makeController({ groups, counts: [], serviceTimes: [sunday9] });
    const result = (await controller.postCheckin(req(memberVisit()), res)) as CheckinResult;
    expect(result.status).toBe(409);
    expect(result.obj.error).toBe("notOpen");
    expect(result.obj.groups[0]).toEqual({ groupId: "g1", groupName: "Nursery", reason: "notOpen" });
    expect(repos.visit.save).not.toHaveBeenCalled();
  });

  it("re-posts a session the person already holds after its window closes, so another time can be added", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-13T09:00:00-05:00"), doNotFake: ["setTimeout", "nextTick", "setImmediate"] });
    const visits = [{ id: "v0", personId: "p1" }];
    const visitSessions = [{ id: "vs0", visitId: "v0", sessionId: "sess1" }];
    const { controller, repos } = makeController({ groups, counts: [], serviceTimes: [sunday9], visits, visitSessions });
    const result = (await controller.postCheckin(req(memberVisit()), res)) as CheckinResult;
    expect(result?.status).not.toBe(409);
    expect(repos.visit.save).toHaveBeenCalled();
  });

  it("saves inside the check-in window", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-11T08:45:00-05:00"), doNotFake: ["setTimeout", "nextTick", "setImmediate"] });
    const { controller, repos } = makeController({ groups, counts: [], serviceTimes: [sunday9] });
    await controller.postCheckin(req(memberVisit()), res);
    expect(repos.visit.save).toHaveBeenCalled();
  });

  it("saves 40 minutes after the start when the schedule has no end time or close minutes (#1461)", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-11T09:40:00-05:00"), doNotFake: ["setTimeout", "nextTick", "setImmediate"] });
    const startOnly: ServiceTime = { id: "st1", dayOfWeek: 0, startTime: "09:00:00", endTime: null, checkinOpenMinutes: null, checkinCloseMinutes: null };
    const { controller, repos } = makeController({ groups, counts: [], serviceTimes: [startOnly] });
    const result = (await controller.postCheckin(req(memberVisit()), res)) as CheckinResult;
    expect(result?.status).not.toBe(409);
    expect(repos.visit.save).toHaveBeenCalled();
  });
});

describe("postCheckin passthrough", () => {
  it("persists checkinType and returns securityCode when the gate passes", async () => {
    const { controller, repos } = makeController({ groups: [{ id: "g1", name: "Nursery", capacity: 10, checkinClosed: false }], counts: [] });
    const result = (await controller.postCheckin(req(memberVisit()), res)) as CheckinResult;
    expect(repos.visit.save).toHaveBeenCalled();
    expect(repos.visit.save.mock.calls[0][0].checkinType).toBe("member");
    expect(result.securityCode).toBe("ABCD");
  });

  it("returns the visit's existing securityCode on re-check-in instead of an unsaved fresh one", async () => {
    const { controller, repos } = makeController({ groups: [{ id: "g1", name: "Nursery", capacity: 10, checkinClosed: false }], counts: [] });
    repos.visit.loadByServiceDatePeopleIds = jest.fn(async (): Promise<Visit[]> => [{ id: "old1", personId: "p1", securityCode: "ZZZZ" }]);
    const body = memberVisit();
    body[0].securityCode = "ZZZZ";
    const result = (await controller.postCheckin(req(body), res)) as CheckinResult;
    expect(result.securityCode).toBe("ZZZZ");
    expect(repos.visit.save.mock.calls[0][0].securityCode).toBe("ZZZZ");
    expect(repos.visit.loadByCodeToday).not.toHaveBeenCalled();
  });

  it("replaces a client-supplied code nobody in the batch holds today, and never saves client ids", async () => {
    const { controller, repos } = makeController({ groups: [], counts: [] });
    const body = memberVisit();
    body[0].id = "otherFamilyVisit";
    body[0].securityCode = "EVIL";
    body[0].visitSessions[0].id = "otherFamilyVisitSession";
    const result = (await controller.postCheckin(req(body), res)) as CheckinResult;
    expect(result.securityCode).toBe("ABCD");
    const saved = repos.visit.save.mock.calls[0][0];
    expect(saved.securityCode).toBe("ABCD");
    expect(saved.id).not.toBe("otherFamilyVisit");
    expect(repos.visitSession.save.mock.calls[0][0].id).toBeNull();
  });

  it("legacy check-in with no group config saves normally", async () => {
    const { controller, repos } = makeController({ groups: [], counts: [] });
    await controller.postCheckin(req(memberVisit()), res);
    expect(repos.visit.save).toHaveBeenCalled();
  });
});

describe("postCheckin session resolution", () => {
  it("awaits lazy session creation so visitSessions carry the new sessionId", async () => {
    const { controller, repos } = makeController({ groups: [], counts: [] });
    repos.session.loadByGroupServiceTimeDate = jest.fn(async (): Promise<Session | null> => null);
    repos.session.save = jest.fn(async (s: Session) => {
      await new Promise((r) => setTimeout(r, 10));
      s.id = "sessNew";
      return s;
    });
    await controller.postCheckin(req(memberVisit()), res);
    expect(repos.visitSession.save).toHaveBeenCalled();
    expect(repos.visitSession.save.mock.calls[0][0].sessionId).toBe("sessNew");
  });
});

describe("postCheckin ratio warn mode", () => {
  const ratioGroups = [{ id: "g1", name: "Nursery", checkinClosed: false, volunteerRatio: 5, minVolunteers: 1 }];

  it("returns a 409 warning (nothing saved) when unacknowledged", async () => {
    const { controller, repos } = makeController({ groups: ratioGroups, counts: [], ratioSetting: "warn" });
    const result = (await controller.postCheckin(req(memberVisit()), res)) as CheckinResult;
    expect(result.status).toBe(409);
    expect(result.obj.warning).toBe(true);
    expect(repos.visit.save).not.toHaveBeenCalled();
  });

  it("proceeds when acknowledgeWarnings=true", async () => {
    const { controller, repos } = makeController({ groups: ratioGroups, counts: [], ratioSetting: "warn" });
    await controller.postCheckin(req(memberVisit(), true), res);
    expect(repos.visit.save).toHaveBeenCalled();
  });

  it("block mode returns a hard 409 ratio", async () => {
    const { controller, repos } = makeController({ groups: ratioGroups, counts: [], ratioSetting: "block" });
    const result = (await controller.postCheckin(req(memberVisit()), res)) as CheckinResult;
    expect(result.status).toBe(409);
    expect(result.obj.error).toBe("ratio");
    expect(repos.visit.save).not.toHaveBeenCalled();
  });
});

describe("postCheckin permissions", () => {
  it("allows regular authenticated members with a personId even if checkAccess is false", async () => {
    const { controller, repos } = makeController({ groups: [], counts: [] });
    actAs(controller, { churchId: "c1", id: "u1", personId: "p1", checkAccess: () => false });
    const result = (await controller.postCheckin(req(memberVisit()), res)) as CheckinResult;
    expect(result?.status).not.toBe(401);
    expect(repos.visit.save).toHaveBeenCalled();
  });

  it("returns 401 when unprivileged user has no personId and checkAccess is false", async () => {
    const { controller } = makeController({ groups: [], counts: [] });
    actAs(controller, { churchId: "c1", id: "u1", checkAccess: () => false });
    const result = (await controller.postCheckin(req(memberVisit()), res)) as CheckinResult;
    expect(result.status).toBe(401);
  });
});

describe("self check-in household scoping", () => {
  const memberAu = { churchId: "c1", id: "u1", personId: "p1", checkAccess: () => false };
  const asMember = (controller: VisitController) => {
    actAs(controller, memberAu);
  };

  it("403s postCheckin when a submitted visit targets another household", async () => {
    const { controller, repos } = makeController({ groups: [], counts: [] });
    asMember(controller);
    const body: Visit[] = [{ personId: "p2", checkinType: "member", visitSessions: [] }];
    const result = (await controller.postCheckin(req(body), res)) as CheckinResult;
    expect(result.status).toBe(403);
    expect(repos.visit.save).not.toHaveBeenCalled();
  });

  it("strips volunteer status and forces checkedInById on self check-in", async () => {
    const { controller, repos } = makeController({ groups: [], counts: [] });
    asMember(controller);
    const body: Visit[] = [{ personId: "p1", checkinType: "volunteer", checkedInById: "someoneElse", visitSessions: [] }];
    await controller.postCheckin(req(body), res);
    const saved = repos.visit.save.mock.calls[0][0];
    expect(saved.checkinType).toBeUndefined();
    expect(saved.checkedInById).toBe("p1");
  });

  it("keeps the kiosk's checked-in-by adult when they are a person in the church", async () => {
    const { controller, repos } = makeController({ groups: [], counts: [] });
    const body = memberVisit();
    body[0].checkedInById = "mom";
    await controller.postCheckin(req(body), res);
    expect(gateway.loadPeople).toHaveBeenCalledWith("c1", ["mom"]);
    expect(repos.visit.save.mock.calls[0][0].checkedInById).toBe("mom");
  });

  it("drops a kiosk checked-in-by id that is not a person in the church", async () => {
    const { controller, repos } = makeController({ groups: [], counts: [] });
    const body = memberVisit();
    body[0].checkedInById = "outsider";
    await controller.postCheckin(req(body), res);
    expect(repos.visit.save).toHaveBeenCalled();
    expect(repos.visit.save.mock.calls[0][0].checkedInById).toBeUndefined();
  });

  it("allows getCheckin for the member's own household", async () => {
    const { controller } = makeController();
    asMember(controller);
    const result = await controller.getCheckin(req(null), res);
    expect(result).toEqual([]);
  });

  it("403s getCheckin when querying outside the household", async () => {
    const { controller } = makeController();
    asMember(controller);
    const result = (await controller.getCheckin(asReq({ query: { serviceId: "s1", peopleIds: "p1,p2" } }), res)) as CheckinResult;
    expect(result.status).toBe(403);
  });

  it("skips the household check for staff/kiosk callers", async () => {
    const { controller } = makeController();
    actAs(controller, { churchId: "c1", id: "u1", checkAccess: () => true });
    const result = await controller.getCheckin(asReq({ query: { serviceId: "s1", peopleIds: "p2,p3" } }), res);
    expect(result).toEqual([]);
    expect(gateway.loadHouseholdPeople).not.toHaveBeenCalled();
  });
});


describe("check-in with a visit session whose session row is gone", () => {
  // Production: POST /attendance/visits/checkin 500'd reading vs.session.serviceTimeId after a client re-posted
  // the visits GET /checkin returned, which included a visitSession with no matching session (NULL or deleted sessionId).
  const today = new Date();
  const visits = () => [{ id: "v1", personId: "p1", visitDate: today, securityCode: "ABCD" }];
  const visitSessions = () => [{ id: "vs1", visitId: "v1", sessionId: "sess1" }, { id: "vs2", visitId: "v1", sessionId: null }];

  it("getCheckin leaves out visit sessions it cannot attach a session to", async () => {
    const { controller } = makeController({ visits: visits(), visitSessions: visitSessions(), sessions: [{ id: "sess1", serviceTimeId: "st1", groupId: "g1" }] });
    const result = (await controller.getCheckin(req(null), res)) as Visit[];
    expect(result).toHaveLength(1);
    expect(result[0].visitSessions).toHaveLength(1);
    expect(result[0].visitSessions[0].session.serviceTimeId).toBe("st1");
  });

  it("postCheckin answers 400 for a visit session without a session, and saves nothing", async () => {
    const { controller, repos } = makeController();
    const result = (await controller.postCheckin(req([{ personId: "p1", checkinType: "member", visitSessions: [{ sessionId: "gone" }] }]), res)) as CheckinResult;
    expect(result.status).toBe(400);
    expect(repos.visit.save).not.toHaveBeenCalled();
    expect(repos.session.save).not.toHaveBeenCalled();
  });
});
