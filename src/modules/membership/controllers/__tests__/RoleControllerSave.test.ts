import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { roles: { view: "rView", edit: "rEdit" }, server: { admin: "admin" } } }));

import express from "express";
import { MembershipBaseController } from "../MembershipBaseController.js";
import { RoleController } from "../RoleController.js";
import { RoleMemberController } from "../RoleMemberController.js";
import { Role, RoleMember } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };

const au = { id: "u1", churchId: "c1", checkAccess: () => true };
const res = {} as express.Response;
const asRequest = <B>(partial: Partial<express.Request<{}, {}, B>>) => partial as express.Request<{}, {}, B>;

function wire<T extends MembershipBaseController>(controller: T, repos: Record<string, unknown>): T {
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status }),
    checkAccess: async () => true
  });
  return controller;
}

describe("RoleController.save body shape (#1194)", () => {
  it("accepts a single role object", async () => {
    const repos = { role: { save: jest.fn(async (r: Role) => ({ ...r, id: "r1" })) } };
    const controller = wire(new RoleController(), repos);
    const result = (await controller.save(asRequest<Role>({ body: { name: "Volunteers" } }), res)) as JsonResult;
    expect(result.status).toBe(200);
    expect(result.obj).toEqual([{ id: "r1", name: "Volunteers", churchId: "c1" }]);
  });
});

describe("RoleMemberController.save body shape (#1194)", () => {
  it("accepts a single role member object", async () => {
    const repos = {
      role: { loadById: jest.fn(async () => ({ id: "r1", churchId: "c1" })) },
      roleMember: { save: jest.fn(async (m: RoleMember) => ({ ...m, id: "rm1" })) }
    };
    const controller = wire(new RoleMemberController(), repos);
    controller.rolesInChurch = async () => true;
    const result = (await controller.save(asRequest<RoleMember>({ body: { roleId: "r1", userId: "u2" } }), res)) as JsonResult;
    expect(result.status).toBe(200);
    expect(result.obj).toEqual([expect.objectContaining({ id: "rm1", roleId: "r1", userId: "u2", churchId: "c1" })]);
  });
});

describe("RoleController.loadByChurchId member counts (#1330)", () => {
  it("returns the number of distinct users in each role", async () => {
    const repos = {
      role: {
        loadByChurchId: jest.fn(async () => [{ id: "r1", churchId: "c1", name: "Admins" }, { id: "r2", churchId: "c1", name: "Empty" }]),
        convertAllToModel: (_churchId: string, data: Role[]) => data
      },
      roleMember: {
        loadAll: jest.fn(async () => [
          { id: "m1", roleId: "r1", userId: "u1" },
          { id: "m2", roleId: "r1", userId: "u2" },
          { id: "m3", roleId: "r1", userId: "u2" }
        ])
      }
    };
    const controller = wire(new RoleController(), repos);
    const result = await controller.loadByChurchId("c1", asRequest<[]>({}), res);
    expect(repos.roleMember.loadAll).toHaveBeenCalledWith("c1");
    expect(result).toEqual([
      { id: "r1", churchId: "c1", name: "Admins", memberCount: 2 },
      { id: "r2", churchId: "c1", name: "Empty", memberCount: 0 }
    ]);
  });
});
