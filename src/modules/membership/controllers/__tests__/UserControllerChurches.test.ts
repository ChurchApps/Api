import "reflect-metadata";

const chain: any = new Proxy(function () {}, { get: () => chain, apply: () => chain });

jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class {} }));
jest.mock("express-validator", () => ({ body: () => chain, oneOf: () => chain, validationResult: jest.fn(() => ({ isEmpty: () => true, array: () => [] })) }));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { compareSync: jest.fn(), hashSync: jest.fn() } }));
jest.mock("../../auth/index", () => ({ AuthenticatedUser: { login: jest.fn(), loadUserByJwt: jest.fn() } }));
jest.mock("../../helpers/index", () => ({
  UserHelper: { replaceDomainAdminPermissions: jest.fn(), addAllReportingPermissions: jest.fn() },
  UserChurchHelper: {},
  UniqueIdHelper: { shortId: () => "tmp" },
  Environment: { currentEnvironment: "test" },
  Permissions: {},
  AuditLogHelper: {},
  MauticHelper: {},
  ChurchHelper: {}
}));
jest.mock("../../models/index", () => ({}));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({
  ArrayHelper: {
    getOne: (arr: any[], k: string, v: any) => (arr || []).find((x: any) => k.split(".").reduce((o, p) => o?.[p], x) === v) || null,
    getAll: (arr: any[], k: string, v: any) => (arr || []).filter((x: any) => x[k] === v)
  }
}));
jest.mock("uuid", () => ({ v4: () => "guid" }));

import { UserController } from "../UserController.js";

const editSelf = { keyName: "MembershipApi", permissions: [{ contentType: "People", contentId: "", action: "Edit Self" }] };

function controllerFor(roleChurches: any[], memberChurches: any[], everyone: Record<string, any[]>) {
  const repos: any = {
    rolePermission: {
      loadForUser: jest.fn(async () => roleChurches),
      loadEveryoneApis: jest.fn(async () => everyone)
    },
    church: { loadForUser: jest.fn(async () => memberChurches) },
    person: { loadByIdsOnly: jest.fn(async () => []) },
    groupMember: { loadForPeople: jest.fn(async () => []) }
  };
  const controller = new UserController();
  (controller as any).repos = repos;
  return { controller, repos };
}

describe("UserController.getUserChurches Everyone permissions", () => {
  it("gives a member who is in no role the church's Everyone permissions", async () => {
    const { controller } = controllerFor([], [{ church: { id: "c1", name: "Grace" }, person: { id: "p1" }, apis: [] }], { c1: [editSelf] });
    const churches = await (controller as any).getUserChurches("u1");
    expect(churches).toHaveLength(1);
    expect(churches[0].apis).toEqual([editSelf]);
  });

  it("leaves role-based permissions alone for churches the user has a role in", async () => {
    const roleApis = [{ keyName: "MembershipApi", permissions: [{ contentType: "People", contentId: "", action: "Edit" }] }];
    const { controller, repos } = controllerFor(
      [{ church: { id: "c1" }, person: { id: "p1" }, apis: roleApis }],
      [{ church: { id: "c1" }, person: { id: "p1" }, apis: [] }],
      {}
    );
    const churches = await (controller as any).getUserChurches("u1");
    expect(churches[0].apis).toBe(roleApis);
    expect(repos.rolePermission.loadEveryoneApis).not.toHaveBeenCalled();
  });
});
