import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { server: { admin: "serverAdmin" }, settings: { edit: "settingsEdit" } },
  UserHelper: { replaceDomainAdminPermissions: jest.fn(async () => {}), addAllReportingPermissions: jest.fn() },
  PersonHelper: { claim: jest.fn(async () => ({ userChurch: { churchId: "c1", personId: "p1" } })) },
  Utils: { isEmpty: (v: any) => v === undefined || v === null || v === "" },
  ChurchHelper: {},
  RoleHelper: class {},
  Environment: {},
  HubspotHelper: {},
  MauticHelper: {},
  GeoHelper: {}
}));
jest.mock("../auth/index", () => ({ AuthenticatedUser: { login: jest.fn(async (churches: any[], user: any) => ({ user, userChurches: churches })) } }));
jest.mock("../models/index", () => ({}));
jest.mock("../models/requests", () => ({}));
jest.mock("../repositories/index", () => ({ Repos: class {} }));
jest.mock("../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: () => null, getIds: () => [] } }));

import { ChurchController } from "../ChurchController.js";
import { UserHelper, PersonHelper } from "../../helpers/index.js";
import { AuthenticatedUser } from "../auth/index.js";

function churchController(opts: any = {}) {
  const membershipPerms = opts.membershipPerms ?? [{ contentType: "People", action: "View" }];
  const churchResult = {
    church: { id: opts.churchId ?? "c1", name: "Test Church", subDomain: "testchurch" },
    person: { id: "p1" },
    apis: [{ keyName: "MembershipApi", permissions: membershipPerms.map((p: any) => ({ ...p })) }]
  };
  const repos: any = {
    user: { load: jest.fn(async () => ({ id: "u1", email: "a@b.c" })) },
    rolePermission: {
      loadForUser: jest.fn(async () => opts.userChurches ?? []),
      loadForChurch: jest.fn(async () => churchResult),
      loadUserPermissionInChurch: jest.fn(async () => opts.userPermission ?? null)
    },
    church: { loadBySubDomain: jest.fn(async () => opts.subDomainChurch ?? null) },
    person: { load: jest.fn(async () => ({ id: "p1", membershipStatus: "Member", name: { first: "A", last: "B" } })) },
    group: { loadAllForPerson: jest.fn(async () => []) }
  };
  const au = { id: "u1", churchId: opts.auChurchId ?? "c1", checkAccess: (perm: any) => (opts.access ?? []).includes(perm) };
  const controller = new ChurchController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos, churchResult };
}

function hasDomainAdmin(loginUserChurch: any) {
  const membershipApi = (loginUserChurch?.apis || []).find((a: any) => a.keyName === "MembershipApi");
  return (membershipApi?.permissions || []).some((p: any) => p.contentType === "Domain" && p.action === "Admin");
}

beforeEach(() => {
  (UserHelper.replaceDomainAdminPermissions as jest.Mock).mockClear();
  (UserHelper.addAllReportingPermissions as jest.Mock).mockClear();
  (AuthenticatedUser.login as jest.Mock).mockClear();
  (PersonHelper.claim as jest.Mock).mockClear();
});

describe("ChurchController.impersonate authorization", () => {
  it("returns 401 for a non-server-admin whose JWT churchId matches the target", async () => {
    const { controller, repos } = churchController({ access: [], auChurchId: "c1" });
    const result: any = await (controller as any).impersonate("c1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.rolePermission.loadForChurch).not.toHaveBeenCalled();
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("returns 401 for a non-server-admin targeting a different church", async () => {
    const { controller, repos } = churchController({ access: [], auChurchId: "c1" });
    const result: any = await (controller as any).impersonate("otherChurch", {}, {});
    expect(result.status).toBe(401);
    expect(repos.rolePermission.loadForChurch).not.toHaveBeenCalled();
  });

  it("lets a server admin impersonate and mint a login for the target church", async () => {
    const { controller, repos } = churchController({ access: ["serverAdmin"], auChurchId: "adminChurch" });
    const result: any = await (controller as any).impersonate("c1", {}, {});
    expect(repos.rolePermission.loadForChurch).toHaveBeenCalledWith("c1", null);
    expect(UserHelper.replaceDomainAdminPermissions).toHaveBeenCalled();
    expect(UserHelper.addAllReportingPermissions).toHaveBeenCalled();
    expect(AuthenticatedUser.login).toHaveBeenCalled();
    expect(result.userChurches[0].church.id).toBe("c1");
  });

  it("does not fabricate Domain Admin when the church roles do not include it", async () => {
    const { controller } = churchController({ access: ["serverAdmin"], membershipPerms: [{ contentType: "People", action: "View" }] });
    const result: any = await (controller as any).impersonate("c1", {}, {});
    const passedToReplace = (UserHelper.replaceDomainAdminPermissions as jest.Mock).mock.calls[0][0][0];
    const passedToLogin = (AuthenticatedUser.login as jest.Mock).mock.calls[0][0][0];
    expect(hasDomainAdmin(passedToReplace)).toBe(false);
    expect(hasDomainAdmin(passedToLogin)).toBe(false);
    expect(hasDomainAdmin(result.userChurches[0])).toBe(false);
  });

  it("still expands a Domain Admin that already exists on the church", async () => {
    const { controller } = churchController({ access: ["serverAdmin"], membershipPerms: [{ contentType: "Domain", action: "Admin" }] });
    await (controller as any).impersonate("c1", {}, {});
    const passedToReplace = (UserHelper.replaceDomainAdminPermissions as jest.Mock).mock.calls[0][0][0];
    expect(hasDomainAdmin(passedToReplace)).toBe(true);
    expect(UserHelper.replaceDomainAdminPermissions).toHaveBeenCalled();
  });
});

describe("ChurchController.select authorization", () => {
  it("returns 401 when the caller has no role in the target church", async () => {
    const { controller, repos } = churchController({ userPermission: null });
    const result: any = await (controller as any).select({ body: { churchId: "c1" } }, {});
    expect(result.status).toBe(401);
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
    expect(repos.user.load).not.toHaveBeenCalled();
  });

  it("lets a caller who already belongs to the church (post-registration owner) select it", async () => {
    const userPermission = { church: { id: "c1", name: "Test Church" }, person: { id: "p1" }, apis: [{ keyName: "MembershipApi", permissions: [{ contentType: "Domain", action: "Admin" }] }] };
    const { controller } = churchController({ userPermission });
    const result: any = await (controller as any).select({ body: { churchId: "c1" } }, {});
    expect(PersonHelper.claim).toHaveBeenCalled();
    expect(AuthenticatedUser.login).toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(result.obj.church.id).toBe("c1");
  });

  it("returns 400 when no church is specified", async () => {
    const { controller } = churchController();
    const result: any = await (controller as any).select({ body: {} }, {});
    expect(result.status).toBe(400);
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });
});
