import "reflect-metadata";

// Stands in for any express-validator chain: every property and call returns the chain again.
type Chain = { (...args: unknown[]): Chain; [key: string]: Chain };
const chain: Chain = new Proxy(function () {} as Chain, { get: () => chain, apply: () => chain });

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
    getOne: (arr: Record<string, unknown>[], k: string, v: unknown) => (arr || []).find((x) => k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], x) === v) || null,
    getAll: (arr: Record<string, unknown>[], k: string, v: unknown) => (arr || []).filter((x) => x[k] === v)
  }
}));
jest.mock("uuid", () => ({ v4: () => "guid" }));

import { UserController } from "../UserController.js";
import type { Api, LoginUserChurch } from "../../models/index.js";

const editSelf: Api = { keyName: "MembershipApi", permissions: [{ contentType: "People", contentId: "", action: "Edit Self" }] };

function controllerFor(roleChurches: LoginUserChurch[], memberChurches: LoginUserChurch[], everyone: Record<string, Api[]>) {
  const repos = {
    rolePermission: {
      loadForUser: jest.fn(async () => roleChurches),
      loadEveryoneApis: jest.fn(async () => everyone)
    },
    church: { loadForUser: jest.fn(async () => memberChurches) },
    person: { loadByIdsOnly: jest.fn(async () => []) },
    groupMember: { loadForPeople: jest.fn(async () => []) }
  };
  const controller = new UserController();
  Object.assign(controller, { repos });
  return { controller, repos };
}

describe("UserController.getUserChurches Everyone permissions", () => {
  it("gives a member who is in no role the church's Everyone permissions", async () => {
    const { controller } = controllerFor([], [{ church: { id: "c1", name: "Grace" }, person: { id: "p1" }, apis: [] }], { c1: [editSelf] });
    const churches = await controller["getUserChurches"]("u1");
    expect(churches).toHaveLength(1);
    expect(churches[0].apis).toEqual([editSelf]);
  });

  it("leaves role-based permissions alone for churches the user has a role in", async () => {
    const roleApis: Api[] = [{ keyName: "MembershipApi", permissions: [{ contentType: "People", contentId: "", action: "Edit" }] }];
    const { controller, repos } = controllerFor(
      [{ church: { id: "c1" }, person: { id: "p1" }, apis: roleApis }] as LoginUserChurch[],
      [{ church: { id: "c1" }, person: { id: "p1" }, apis: [] }] as LoginUserChurch[],
      {}
    );
    const churches = await controller["getUserChurches"]("u1");
    expect(churches[0].apis).toBe(roleApis);
    expect(repos.rolePermission.loadEveryoneApis).not.toHaveBeenCalled();
  });
});
