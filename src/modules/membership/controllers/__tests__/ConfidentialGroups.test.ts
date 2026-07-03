import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { groupMembers: { view: "gmView", edit: "gmEdit" }, groups: { edit: "groupsEdit" }, plans: { edit: "plansEdit" } },
  UserChurchHelper: { createForGroupMember: jest.fn() }
}));
jest.mock("../../models/requests", () => ({}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getAll: () => [], getIds: () => [] }, SlugHelper: { slugifyString: (s: string) => s } }));
jest.mock("../../../../shared/infrastructure/KyselyPool", () => ({ KyselyPool: { getDb: jest.fn() } }));

import { GroupMemberController } from "../GroupMemberController.js";
import { GroupController } from "../GroupController.js";

function gmController(opts: any = {}) {
  const repos: any = {
    group: { load: jest.fn(async () => opts.group) },
    groupMember: {
      loadForGroup: jest.fn(async () => opts.members ?? []),
      loadPublicForGroup: jest.fn(async () => opts.members ?? []),
      loadLeadersForGroup: jest.fn(async () => opts.members ?? []),
      convertAllToBasicModel: (_c: string, r: any[]) => r,
      convertAllToPublicModel: (_c: string, r: any[]) => r,
      convertAllToModel: (_c: string, r: any[]) => r
    }
  };
  const au = { churchId: "c1", personId: opts.personId ?? "p1", groupIds: opts.groupIds ?? [], leaderGroupIds: opts.leaderGroupIds ?? [], checkAccess: (perm: any) => (opts.access ?? []).includes(perm) };
  const controller = new GroupMemberController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

function grpController(opts: any = {}) {
  const repos: any = {
    group: {
      load: jest.fn(async () => opts.group),
      convertToModel: (_c: string, g: any) => g
    }
  };
  const controller = new GroupController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", personId: "p1", checkAccess: () => true });
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("Confidential group roster gating (getbasic)", () => {
  it("blocks a non-member non-staff caller (401)", async () => {
    const { controller, repos } = gmController({ group: { id: "g1", confidential: true }, groupIds: ["other"] });
    const result = await (controller as any).getbasic("g1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.groupMember.loadForGroup).not.toHaveBeenCalled();
  });

  it("allows a member of the confidential group", async () => {
    const { controller, repos } = gmController({ group: { id: "g1", confidential: true }, groupIds: ["g1"], members: [{ personId: "p2" }] });
    const result = await (controller as any).getbasic("g1", {}, {});
    expect(repos.groupMember.loadForGroup).toHaveBeenCalled();
    expect(result).toEqual([{ personId: "p2" }]);
  });

  it("allows staff with groupMembers.view", async () => {
    const { controller, repos } = gmController({ group: { id: "g1", confidential: true }, access: ["gmView"] });
    await (controller as any).getbasic("g1", {}, {});
    expect(repos.groupMember.loadForGroup).toHaveBeenCalled();
  });

  it("leaves non-confidential rosters open to any authed user", async () => {
    const { controller, repos } = gmController({ group: { id: "g1", confidential: false }, groupIds: ["other"] });
    await (controller as any).getbasic("g1", {}, {});
    expect(repos.groupMember.loadForGroup).toHaveBeenCalled();
  });
});

describe("Confidential group excluded from anon roster endpoints", () => {
  it("getPublicMembers returns empty for a confidential group", async () => {
    const { controller, repos } = gmController({ group: { id: "g1", confidential: true }, members: [{ personId: "p2" }] });
    const result = await (controller as any).getPublicMembers("c1", "g1", {}, {});
    expect(result).toEqual([]);
    expect(repos.groupMember.loadPublicForGroup).not.toHaveBeenCalled();
  });

  it("getPublicLeaders returns empty for a confidential group", async () => {
    const { controller } = gmController({ group: { id: "g1", confidential: true }, members: [{ personId: "p2" }] });
    const result = await (controller as any).getPublicLeaders("c1", "g1", {}, {});
    expect(result).toEqual([]);
  });
});

describe("Confidential group excluded from public finder / by-id", () => {
  it("getPublic (anon by id) 404s a confidential group", async () => {
    const { controller } = grpController({ group: { id: "g1", confidential: true } });
    const result = await (controller as any).getPublic("c1", "g1", {}, {});
    expect(result.status).toBe(404);
  });

  it("getPublic still returns a normal group", async () => {
    const { controller } = grpController({ group: { id: "g1", confidential: false, name: "Youth" } });
    const result = await (controller as any).getPublic("c1", "g1", {}, {});
    expect(result).toMatchObject({ id: "g1", name: "Youth" });
  });

  it("authed by-id get still returns a confidential group for staff", async () => {
    const { controller } = grpController({ group: { id: "g1", confidential: true, name: "Care" } });
    const result = await (controller as any).get("g1", {}, {});
    expect(result).toMatchObject({ id: "g1", name: "Care" });
  });
});
