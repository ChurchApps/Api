import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { roles: { view: "rView", edit: "rEdit" }, server: { admin: "admin" } } }));

import { RoleController } from "../RoleController.js";
import { RoleMemberController } from "../RoleMemberController.js";

const au = { id: "u1", churchId: "c1", checkAccess: () => true };

function wire(controller: any, repos: any) {
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(au);
  controller.json = (obj: any, status: number) => ({ obj, status });
  controller.checkAccess = async () => true;
  return controller;
}

describe("RoleController.save body shape (#1194)", () => {
  it("accepts a single role object", async () => {
    const repos = { role: { save: jest.fn(async (r: any) => ({ ...r, id: "r1" })) } };
    const controller = wire(new RoleController(), repos);
    const result = await controller.save({ body: { name: "Volunteers" } }, {});
    expect(result.status).toBe(200);
    expect(result.obj).toEqual([{ id: "r1", name: "Volunteers", churchId: "c1" }]);
  });
});

describe("RoleMemberController.save body shape (#1194)", () => {
  it("accepts a single role member object", async () => {
    const repos = {
      role: { loadById: jest.fn(async () => ({ id: "r1", churchId: "c1" })) },
      roleMember: { save: jest.fn(async (m: any) => ({ ...m, id: "rm1" })) }
    };
    const controller = wire(new RoleMemberController(), repos);
    controller.rolesInChurch = async () => true;
    const result = await controller.save({ body: { roleId: "r1", userId: "u2" } }, {});
    expect(result.status).toBe(200);
    expect(result.obj).toEqual([expect.objectContaining({ id: "rm1", roleId: "r1", userId: "u2", churchId: "c1" })]);
  });
});
