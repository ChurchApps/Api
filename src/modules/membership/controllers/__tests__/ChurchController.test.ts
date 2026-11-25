import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { server: { admin: "serverAdmin" }, settings: { edit: "settingsEdit" } },
  UserHelper: { replaceDomainAdminPermissions: jest.fn(async () => {}), addAllReportingPermissions: jest.fn() },
  PersonHelper: { claim: jest.fn(async (au: { email?: string } | null) => (au?.email ? { userChurch: { churchId: "c1", personId: "p1" } } : undefined)) },
  Utils: { isEmpty: (v: unknown) => v === undefined || v === null || v === "" },
  ChurchHelper: { selectSubDomain: jest.fn(async () => "newchurch") },
  RoleHelper: class { async init() {} },
  Environment: {},
  HubspotHelper: {},
  MauticHelper: {},
  GeoHelper: {}
}));
jest.mock("../../auth/index", () => ({ AuthenticatedUser: { login: jest.fn(async (churches: LoginUserChurch[], user: User) => ({ user, userChurches: churches })) } }));
jest.mock("../../models/index", () => ({}));
jest.mock("../../models/requests", () => ({}));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: (): null => null, getIds: (): string[] => [] } }));

import express from "express";
import { ChurchController } from "../ChurchController.js";
import { UserHelper, PersonHelper, ChurchHelper } from "../../helpers/index.js";
import { AuthenticatedUser } from "../../auth/index.js";
import { Church, LoginUserChurch, RegisterChurchRequest, RegistrationRequest, Setting, Site, User } from "../../models/index.js";

type TestUser = { id: string; email: string; churchId: string; checkAccess: (perm: string) => boolean };
type JsonResult<T = unknown> = { obj: T; status: number };
type LoginResult = { user: User; userChurches: LoginUserChurch[] };
type TestPermission = { contentType?: string; action?: string };
type TestLoginChurch = Omit<Partial<LoginUserChurch>, "apis"> & { apis?: { keyName?: string; permissions?: TestPermission[] }[] };
type SelectBody = { churchId: string; subDomain: string };
type RequestParts<B> = Omit<Partial<express.Request<{}, {}, B>>, "body"> & { body?: Partial<B> };

interface ChurchControllerOpts {
  membershipPerms?: TestPermission[];
  churchId?: string;
  fullChurch?: Church;
  churchesById?: Record<string, Church>;
  userChurches?: LoginUserChurch[];
  userPermission?: TestLoginChurch | null;
  subDomainChurch?: Church;
  site?: Site;
  au?: TestUser | null;
  auChurchId?: string;
  access?: string[];
}

interface ChurchTestRepos {
  user: { load: jest.Mock };
  rolePermission: { loadForUser: jest.Mock; loadForChurch: jest.Mock; loadUserPermissionInChurch: jest.Mock };
  church: {
    loadBySubDomain: jest.Mock;
    loadById: jest.Mock;
    loadByIds: jest.Mock;
    convertToModel: jest.Mock;
    convertAllToModel: jest.Mock;
    search?: jest.Mock;
    loadForUser?: jest.Mock;
    save?: jest.Mock;
  };
  site: { loadBySubDomain: jest.Mock };
  person: { load: jest.Mock };
  group: { loadAllForPerson: jest.Mock };
  setting?: { save: jest.Mock };
}

const req = {} as express.Request;
const res = {} as express.Response;
const asRequest = <B>(parts: RequestParts<B>) => parts as express.Request<{}, {}, B>;

function churchController(opts: ChurchControllerOpts = {}) {
  const membershipPerms = opts.membershipPerms ?? [{ contentType: "People", action: "View" }];
  const churchResult = {
    church: { id: opts.churchId ?? "c1", name: "Test Church", subDomain: "testchurch" },
    person: { id: "p1" },
    apis: [{ keyName: "MembershipApi", permissions: membershipPerms.map((p) => ({ ...p })) }]
  };
  const fullChurch = opts.fullChurch ?? { id: "c1", name: "Test Church", subDomain: "testchurch", address1: "123 Main", city: "Dallas", state: "TX", zip: "75001", latitude: 32.7, longitude: -96.8 };
  const churchesById = opts.churchesById ?? { [fullChurch.id]: fullChurch };
  const repos: ChurchTestRepos = {
    user: { load: jest.fn(async () => ({ id: "u1", email: "a@b.c" })) },
    rolePermission: {
      loadForUser: jest.fn(async () => opts.userChurches ?? []),
      loadForChurch: jest.fn(async () => churchResult),
      loadUserPermissionInChurch: jest.fn(async () => opts.userPermission ?? null)
    },
    church: {
      loadBySubDomain: jest.fn(async () => opts.subDomainChurch ?? null),
      loadById: jest.fn(async (id: string) => churchesById[id] ?? null),
      loadByIds: jest.fn(async (ids: string[]) => ids.map((id) => churchesById[id]).filter(Boolean)),
      convertToModel: jest.fn((data: Church) => data ? { ...data } : null),
      convertAllToModel: jest.fn((data: Church[]) => (data || []).map((d: Church) => ({ ...d })))
    },
    site: { loadBySubDomain: jest.fn(async () => opts.site ?? null) },
    person: { load: jest.fn(async () => ({ id: "p1", membershipStatus: "Member", name: { first: "A", last: "B" } })) },
    group: { loadAllForPerson: jest.fn(async (): Promise<unknown[]> => []) }
  };
  const au: TestUser | null = "au" in opts ? opts.au : { id: "u1", email: "a@b.c", churchId: opts.auChurchId ?? "c1", checkAccess: (perm: string) => (opts.access ?? []).includes(perm) };
  const controller = new ChurchController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: TestUser | null) => unknown) => action(au),
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action(),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos, churchResult };
}

function hasDomainAdmin(loginUserChurch: TestLoginChurch) {
  const membershipApi = (loginUserChurch?.apis || []).find((a) => a.keyName === "MembershipApi");
  return (membershipApi?.permissions || []).some((p) => p.contentType === "Domain" && p.action === "Admin");
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
    const result = (await controller.impersonate("c1", req, res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.rolePermission.loadForChurch).not.toHaveBeenCalled();
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("returns 401 for a non-server-admin targeting a different church", async () => {
    const { controller, repos } = churchController({ access: [], auChurchId: "c1" });
    const result = (await controller.impersonate("otherChurch", req, res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.rolePermission.loadForChurch).not.toHaveBeenCalled();
  });

  it("lets a server admin impersonate and mint a login for the target church", async () => {
    const { controller, repos } = churchController({ access: ["serverAdmin"], auChurchId: "adminChurch" });
    const result = (await controller.impersonate("c1", req, res)) as LoginResult;
    expect(repos.rolePermission.loadForChurch).toHaveBeenCalledWith("c1", null);
    expect(UserHelper.replaceDomainAdminPermissions).toHaveBeenCalled();
    expect(UserHelper.addAllReportingPermissions).toHaveBeenCalled();
    expect(AuthenticatedUser.login).toHaveBeenCalled();
    expect(result.userChurches[0].church.id).toBe("c1");
  });

  it("does not fabricate Domain Admin when the church roles do not include it", async () => {
    const { controller } = churchController({ access: ["serverAdmin"], membershipPerms: [{ contentType: "People", action: "View" }] });
    const result = (await controller.impersonate("c1", req, res)) as LoginResult;
    const passedToReplace = (UserHelper.replaceDomainAdminPermissions as jest.Mock).mock.calls[0][0][0];
    const passedToLogin = (AuthenticatedUser.login as jest.Mock).mock.calls[0][0][0];
    expect(hasDomainAdmin(passedToReplace)).toBe(false);
    expect(hasDomainAdmin(passedToLogin)).toBe(false);
    expect(hasDomainAdmin(result.userChurches[0])).toBe(false);
  });

  it("still expands a Domain Admin that already exists on the church", async () => {
    const { controller } = churchController({ access: ["serverAdmin"], membershipPerms: [{ contentType: "Domain", action: "Admin" }] });
    await controller.impersonate("c1", req, res);
    const passedToReplace = (UserHelper.replaceDomainAdminPermissions as jest.Mock).mock.calls[0][0][0];
    expect(hasDomainAdmin(passedToReplace)).toBe(true);
    expect(UserHelper.replaceDomainAdminPermissions).toHaveBeenCalled();
  });
});

describe("ChurchController.select authorization", () => {
  it("returns 401 for an anonymous caller", async () => {
    const { controller, repos } = churchController({ au: null });
    const result = (await controller.select(asRequest<SelectBody>({ body: { churchId: "c1" } }), res)) as JsonResult<LoginUserChurch>;
    expect(result.status).toBe(401);
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
    expect(repos.user.load).not.toHaveBeenCalled();
  });

  // Production: 12 "reading 'userChurch'" 500s on /membership/churches/select from a principal with no email (API keys
  // authenticate without one), because PersonHelper.claim only claims a person for an email.
  it("returns 401 for a principal with no email instead of crashing on the claim", async () => {
    const { controller } = churchController({ au: { id: "u1", email: "", churchId: "c1", checkAccess: () => false }, userPermission: null });
    const result = (await controller.select(asRequest<SelectBody>({ body: { churchId: "c1" } }), res)) as JsonResult<LoginUserChurch>;
    expect(result.status).toBe(401);
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("lets a caller with no role in the target church join it", async () => {
    const { controller } = churchController({ userPermission: null });
    const result = (await controller.select(asRequest<SelectBody>({ body: { churchId: "c1" } }), res)) as JsonResult<LoginUserChurch>;
    expect(PersonHelper.claim).toHaveBeenCalled();
    expect(AuthenticatedUser.login).toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(result.obj.church.id).toBe("c1");
    expect(result.obj.apis).toEqual([]);
  });

  it("returns 404 when the caller has no role and the church does not exist", async () => {
    const { controller } = churchController({ userPermission: null, churchesById: {} });
    const result = (await controller.select(asRequest<SelectBody>({ body: { churchId: "c1" } }), res)) as JsonResult<LoginUserChurch>;
    expect(result.status).toBe(404);
    expect(PersonHelper.claim).not.toHaveBeenCalled();
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("returns 404 when the caller has no role and the church is archived", async () => {
    const churchesById = { c1: { id: "c1", name: "Test Church", subDomain: "testchurch", archivedDate: new Date("2025-01-01") } };
    const { controller } = churchController({ userPermission: null, churchesById });
    const result = (await controller.select(asRequest<SelectBody>({ body: { churchId: "c1" } }), res)) as JsonResult<LoginUserChurch>;
    expect(result.status).toBe(404);
    expect(PersonHelper.claim).not.toHaveBeenCalled();
  });

  it("lets a caller who already belongs to the church (post-registration owner) select it", async () => {
    const userPermission = { church: { id: "c1", name: "Test Church" }, person: { id: "p1" }, apis: [{ keyName: "MembershipApi", permissions: [{ contentType: "Domain", action: "Admin" }] }] };
    const { controller } = churchController({ userPermission });
    const result = (await controller.select(asRequest<SelectBody>({ body: { churchId: "c1" } }), res)) as JsonResult<LoginUserChurch>;
    expect(PersonHelper.claim).toHaveBeenCalled();
    expect(AuthenticatedUser.login).toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(result.obj.church.id).toBe("c1");
  });

  it("returns 400 when no church is specified", async () => {
    const { controller } = churchController();
    const result = (await controller.select(asRequest<SelectBody>({ body: {} }), res)) as JsonResult<LoginUserChurch>;
    expect(result.status).toBe(400);
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });
});

describe("ChurchController.get authorization", () => {
  it("returns 401 when a normal JWT requests another church", async () => {
    const { controller, repos } = churchController({ access: [], auChurchId: "c1" });
    const result = (await controller.get("otherChurch", req, res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.church.loadById).not.toHaveBeenCalled();
  });

  it("returns the full record for the caller's own church", async () => {
    const { controller, repos } = churchController({ access: [], auChurchId: "c1" });
    const result = (await controller.get("c1", req, res)) as Church;
    expect(repos.church.loadById).toHaveBeenCalledWith("c1");
    expect(result.id).toBe("c1");
    expect(result.address1).toBe("123 Main");
    expect(result.latitude).toBe(32.7);
  });

  it("lets a server admin load another church's full record", async () => {
    const churchesById = {
      c1: { id: "c1", name: "Test Church", subDomain: "testchurch", address1: "123 Main" },
      otherChurch: { id: "otherChurch", name: "Other", subDomain: "other", address1: "999 Oak", latitude: 40.7 }
    };
    const { controller } = churchController({ access: ["serverAdmin"], auChurchId: "c1", churchesById });
    const result = (await controller.get("otherChurch", req, res)) as Church;
    expect(result.id).toBe("otherChurch");
    expect(result.address1).toBe("999 Oak");
    expect(result.latitude).toBe(40.7);
  });

  it("returns 404 when the authorized church is missing", async () => {
    const { controller } = churchController({ access: [], auChurchId: "missing", churchesById: {} });
    const result = (await controller.get("missing", req, res)) as JsonResult;
    expect(result.status).toBe(404);
  });
});

describe("ChurchController.loadByIds", () => {
  it("returns only public lookup fields", async () => {
    const churchesById = { c1: { id: "c1", name: "Test Church", subDomain: "testchurch", address1: "123 Main", latitude: 32.7 } };
    const { controller } = churchController({ churchesById });
    const result = (await controller.loadByIds(asRequest<string[]>({ body: ["c1"] }), res)) as JsonResult;
    expect(result.status).toBe(200);
    expect(result.obj).toEqual([{ id: "c1", name: "Test Church", subDomain: "testchurch" }]);
  });
});

describe("ChurchController.lookup", () => {
  it("returns id name and subDomain for a public id lookup", async () => {
    const { controller } = churchController();
    const result = (await controller.getBySubDomain(asRequest<RegistrationRequest>({ query: { id: "c1" } }), res)) as JsonResult;
    expect(result.status).toBe(200);
    expect(result.obj).toEqual({ id: "c1", name: "Test Church", subDomain: "testchurch" });
  });
});

// Production log: GET/POST /membership/churches/search returned 500 when the typed name held a quote
// (JSON.parse of the wrapped name) or a bare "%" (decodeURIComponent).
describe("ChurchController.search name decoding", () => {
  beforeEach(() => { Object.assign(ChurchHelper, { appendLogos: jest.fn(async () => {}) }); });

  const searchedFor = (repos: ChurchTestRepos) => repos.church.search.mock.calls[0][0];

  it.each([
    ["St. John's \"Main\" Campus", "St. John's \"Main\" Campus"],
    ["100% Grace", "100% Grace"],
    ["back\\slash", "back\\slash"],
    ["First%20Baptist", "First Baptist"],
    ["Igreja %u00C9den", "Igreja Éden"]
  ])("GET searches for %j as %j", async (name, expected) => {
    const { controller, repos } = churchController();
    repos.church.search = jest.fn(async (): Promise<Church[]> => []);
    const result = (await controller.search(asRequest<[]>({ query: { name } }), res)) as JsonResult;
    expect(result.status).toBe(200);
    expect(searchedFor(repos)).toBe(expected);
  });

  it("POST accepts a name with a quote", async () => {
    const { controller, repos } = churchController();
    repos.church.search = jest.fn(async (): Promise<Church[]> => []);
    const result = (await controller.searchPost(asRequest<{ name: string }>({ body: { name: "Grace \"Downtown\"" }, query: {} }), res)) as JsonResult;
    expect(result.status).toBe(200);
    expect(searchedFor(repos)).toBe("Grace \"Downtown\"");
  });
});

describe("ChurchController.addChurch currency default", () => {
  const register = async (country: string) => {
    const { controller, repos } = churchController();
    repos.church.loadForUser = jest.fn(async (): Promise<Church[]> => []);
    repos.church.save = jest.fn(async (c: Church) => ({ ...c, id: "NEW1" }));
    repos.setting = { save: jest.fn(async (s: Setting) => s) };
    Object.assign(controller, { validateRegister: jest.fn(async (): Promise<string[]> => []) });
    const result = (await controller.addChurch(asRequest<RegisterChurchRequest>({ body: { name: "New Church", country } }), res)) as Church;
    return { result, repos };
  };

  it("seeds the church currency setting from the country", async () => {
    const { result, repos } = await register("Kenya");
    expect(result.id).toBe("NEW1");
    expect(repos.setting.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "NEW1", keyName: "currency", value: "kes", public: "1" }));
  });

  it("does not seed a currency for an unknown country", async () => {
    const { repos } = await register("Narnia");
    expect(repos.setting.save).not.toHaveBeenCalled();
  });

  it("still registers the church when the seed fails", async () => {
    const { controller, repos } = churchController();
    repos.church.loadForUser = jest.fn(async (): Promise<Church[]> => []);
    repos.church.save = jest.fn(async (c: Church) => ({ ...c, id: "NEW2" }));
    repos.setting = { save: jest.fn(async () => { throw new Error("db down"); }) };
    Object.assign(controller, { validateRegister: jest.fn(async (): Promise<string[]> => []) });
    const result = (await controller.addChurch(asRequest<RegisterChurchRequest>({ body: { name: "New Church", country: "GB" } }), res)) as Church;
    expect(result.id).toBe("NEW2");
  });
});
