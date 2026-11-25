import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { groupMembers: { view: "gmView", edit: "gmEdit" }, groups: { edit: "groupsEdit" }, plans: { edit: "plansEdit" }, attendance: { view: "attView", edit: "attEdit" } },
  UserChurchHelper: { createForGroupMember: jest.fn() }
}));
jest.mock("../../models/requests", () => ({}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getAll: (): unknown[] => [], getIds: (): string[] => [] }, SlugHelper: { slugifyString: (s: string) => s } }));
jest.mock("../../../../shared/infrastructure/KyselyPool", () => ({ KyselyPool: { getDb: jest.fn() } }));

import { GroupMemberController } from "../GroupMemberController.js";
import { GroupController } from "../GroupController.js";
import type express from "express";
import { Group, GroupMember } from "../../models/index.js";

interface ControllerOpts {
  group?: Group;
  members?: GroupMember[];
  personId?: string;
  groupIds?: string[];
  leaderGroupIds?: string[];
  access?: string[];
}

interface FakeUser {
  churchId: string;
  personId: string;
  groupIds?: string[];
  leaderGroupIds?: string[];
  checkAccess: (perm: string) => boolean;
}

type ConvertAll = (_c: string, r: GroupMember[]) => GroupMember[];

interface GmRepos {
  group: { load: jest.Mock };
  groupMember: {
    loadForGroup: jest.Mock;
    loadPublicForGroup: jest.Mock;
    loadLeadersForGroup: jest.Mock;
    convertAllToBasicModel: ConvertAll;
    convertAllToPublicModel: ConvertAll;
    convertAllToModel: ConvertAll;
    loadForPerson?: jest.Mock;
    save?: jest.Mock;
    convertToModel?: (_c: string, m: GroupMember) => GroupMember;
  };
  groupMemberHistory?: { log: jest.Mock };
}

interface JsonOut { obj: { redirect?: string }; status: number }

const req = {} as express.Request;
const res = {} as express.Response;

function gmController(opts: ControllerOpts = {}) {
  const repos: GmRepos = {
    group: { load: jest.fn(async () => opts.group) },
    groupMember: {
      loadForGroup: jest.fn(async () => opts.members ?? []),
      loadPublicForGroup: jest.fn(async () => opts.members ?? []),
      loadLeadersForGroup: jest.fn(async () => opts.members ?? []),
      convertAllToBasicModel: (_c: string, r: GroupMember[]) => r,
      convertAllToPublicModel: (_c: string, r: GroupMember[]) => r,
      convertAllToModel: (_c: string, r: GroupMember[]) => r
    }
  };
  const au: FakeUser = { churchId: "c1", personId: opts.personId ?? "p1", groupIds: opts.groupIds ?? [], leaderGroupIds: opts.leaderGroupIds ?? [], checkAccess: (perm: string) => (opts.access ?? []).includes(perm) };
  const controller = new GroupMemberController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: FakeUser) => Promise<unknown>) => action(au),
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => Promise<unknown>) => action(),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

function grpController(opts: ControllerOpts = {}) {
  const repos = {
    group: {
      load: jest.fn(async () => opts.group),
      convertToModel: (_c: string, g: Group) => g
    }
  };
  const controller = new GroupController();
  Object.assign(controller, {
    repos,
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => Promise<unknown>) => action(),
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: FakeUser) => Promise<unknown>) => action({ churchId: "c1", personId: "p1", checkAccess: () => true }),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("Confidential group roster gating (getbasic)", () => {
  it("blocks a non-member non-staff caller (401)", async () => {
    const { controller, repos } = gmController({ group: { id: "g1", confidential: true }, groupIds: ["other"] });
    const result = (await controller.getbasic("g1", req, res)) as JsonOut;
    expect(result.status).toBe(401);
    expect(repos.groupMember.loadForGroup).not.toHaveBeenCalled();
  });

  it("allows a member of the confidential group", async () => {
    const { controller, repos } = gmController({ group: { id: "g1", confidential: true }, groupIds: ["g1"], members: [{ personId: "p2" }] });
    const result = (await controller.getbasic("g1", req, res)) as JsonOut;
    expect(repos.groupMember.loadForGroup).toHaveBeenCalled();
    expect(result).toEqual([{ personId: "p2" }]);
  });

  it("allows staff with groupMembers.view", async () => {
    const { controller, repos } = gmController({ group: { id: "g1", confidential: true }, access: ["gmView"] });
    await controller.getbasic("g1", req, res);
    expect(repos.groupMember.loadForGroup).toHaveBeenCalled();
  });

  it("leaves non-confidential rosters open to any authed user", async () => {
    const { controller, repos } = gmController({ group: { id: "g1", confidential: false }, groupIds: ["other"] });
    await controller.getbasic("g1", req, res);
    expect(repos.groupMember.loadForGroup).toHaveBeenCalled();
  });
});

describe("Confidential group excluded from anon roster endpoints", () => {
  it("getPublicMembers returns empty for a confidential group", async () => {
    const { controller, repos } = gmController({ group: { id: "g1", confidential: true }, members: [{ personId: "p2" }] });
    const result = await controller.getPublicMembers("c1", "g1", req, res);
    expect(result).toEqual([]);
    expect(repos.groupMember.loadPublicForGroup).not.toHaveBeenCalled();
  });

  it("getPublicLeaders returns empty for a confidential group", async () => {
    const { controller } = gmController({ group: { id: "g1", confidential: true }, members: [{ personId: "p2" }] });
    const result = await controller.getPublicLeaders("c1", "g1", req, res);
    expect(result).toEqual([]);
  });
});

describe("Confidential group excluded from public finder / by-id", () => {
  it("getPublic (anon by id) 404s a confidential group", async () => {
    const { controller } = grpController({ group: { id: "g1", confidential: true } });
    const result = (await controller.getPublic("c1", "g1", req, res)) as JsonOut;
    expect(result.status).toBe(404);
  });

  it("getPublic still returns a normal group", async () => {
    const { controller } = grpController({ group: { id: "g1", confidential: false, name: "Youth" } });
    const result = (await controller.getPublic("c1", "g1", req, res)) as JsonOut;
    expect(result).toMatchObject({ id: "g1", name: "Youth" });
  });

  it("authed by-id get still returns a confidential group for staff", async () => {
    const { controller } = grpController({ group: { id: "g1", confidential: true, name: "Care" } });
    const result = await controller.get("g1", req, res);
    expect(result).toMatchObject({ id: "g1", name: "Care" });
  });
});

describe("Self-join (/groupmembers/self)", () => {
  function joinController(group: Group, noPerson = false) {
    const { controller, repos } = gmController({ group });
    repos.groupMember.loadForPerson = jest.fn(async (): Promise<GroupMember[]> => []);
    repos.groupMember.save = jest.fn(async (m: GroupMember) => ({ ...m, id: "gm1" }));
    repos.groupMember.convertToModel = (_c: string, m: GroupMember) => m;
    repos.groupMemberHistory = { log: jest.fn() };
    if (noPerson) Object.assign(controller, { actionWrapper: (_req: express.Request, _res: express.Response, action: (user: FakeUser) => Promise<unknown>) => action({ churchId: "c1", personId: "", checkAccess: () => false }) });
    return { controller, repos };
  }

  it("refuses to self-join an open confidential group", async () => {
    const { controller, repos } = joinController({ id: "g1", confidential: true, joinPolicy: "open" });
    const result = (await controller.joinSelf({ body: { groupId: "g1" } } as express.Request, res)) as JsonOut;
    expect(result.status).toBe(403);
    expect(repos.groupMember.save).not.toHaveBeenCalled();
  });

  it("refuses a confidential group with no joinPolicy set", async () => {
    const { controller, repos } = joinController({ id: "g1", confidential: true });
    const result = (await controller.joinSelf({ body: { groupId: "g1" } } as express.Request, res)) as JsonOut;
    expect(result.status).toBe(403);
    expect(repos.groupMember.save).not.toHaveBeenCalled();
  });

  it("routes a confidential request-policy group to the request flow", async () => {
    const { controller } = joinController({ id: "g1", confidential: true, joinPolicy: "request" });
    const result = (await controller.joinSelf({ body: { groupId: "g1" } } as express.Request, res)) as JsonOut;
    expect(result.status).toBe(409);
    expect(result.obj.redirect).toBe("request");
  });

  it("still lets a member join an ordinary open group", async () => {
    const { controller, repos } = joinController({ id: "g1", joinPolicy: "open" });
    await controller.joinSelf({ body: { groupId: "g1" } } as express.Request, res);
    expect(repos.groupMember.save).toHaveBeenCalledWith(expect.objectContaining({ groupId: "g1", personId: "p1" }));
  });

  it("refuses a caller with no person record", async () => {
    const { controller, repos } = joinController({ id: "g1", joinPolicy: "open" }, true);
    const result = (await controller.joinSelf({ body: { groupId: "g1" } } as express.Request, res)) as JsonOut;
    expect(result.status).toBe(401);
    expect(repos.groupMember.save).not.toHaveBeenCalled();
  });
});
