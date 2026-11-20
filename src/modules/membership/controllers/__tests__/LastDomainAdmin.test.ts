import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { roles: { view: "rView", edit: "rEdit" }, server: { admin: "admin" } } }));

import express from "express";
import { MembershipBaseController } from "../MembershipBaseController.js";
import { RoleController } from "../RoleController.js";
import { RoleMemberController } from "../RoleMemberController.js";

type JsonResult = { obj: unknown; status: number };

const req = {} as express.Request;
const res = {} as express.Response;

function wire<T extends MembershipBaseController>(controller: T, repos: Record<string, unknown>): T {
  const au = { id: "u1", churchId: "c1", checkAccess: () => true };
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return controller;
}

function roleRepos(roleName: string, sole: boolean) {
  return {
    role: { loadById: jest.fn(async () => ({ id: "r1", churchId: "c1", name: roleName })), delete: jest.fn() },
    rolePermission: { deleteForRole: jest.fn() },
    roleMember: {
      loadById: jest.fn(async () => ({ id: "rm1", churchId: "c1", roleId: "r1", userId: "u1" })),
      isSoleDomainAdmin: jest.fn(async () => sole),
      delete: jest.fn(),
      deleteSelf: jest.fn(),
      deleteForRole: jest.fn()
    }
  };
}

describe("Removing the last Domain Admin", () => {
  it("refuses to delete the only Domain Admins membership", async () => {
    const repos = roleRepos("Domain Admins", true);
    const result = (await wire(new RoleMemberController(), repos).delete("rm1", req, res)) as JsonResult;
    expect(result.status).toBe(400);
    expect(repos.roleMember.delete).not.toHaveBeenCalled();
  });

  it("still deletes a Domain Admins membership when another admin remains", async () => {
    const repos = roleRepos("Domain Admins", false);
    const result = (await wire(new RoleMemberController(), repos).delete("rm1", req, res)) as JsonResult;
    expect(result.status).toBe(200);
    expect(repos.roleMember.delete).toHaveBeenCalledWith("rm1", "c1");
  });

  it("still deletes a membership in another role", async () => {
    const repos = roleRepos("Volunteers", true);
    const result = (await wire(new RoleMemberController(), repos).delete("rm1", req, res)) as JsonResult;
    expect(result.status).toBe(200);
    expect(repos.roleMember.delete).toHaveBeenCalled();
  });

  it("refuses to let the only Domain Admin leave the church", async () => {
    const repos = roleRepos("Domain Admins", true);
    const result = (await wire(new RoleMemberController(), repos).deleteSelf("c1", "u1", req, res)) as JsonResult;
    expect(result.status).toBe(400);
    expect(repos.roleMember.isSoleDomainAdmin).toHaveBeenCalledWith("c1", "u1");
    expect(repos.roleMember.deleteSelf).not.toHaveBeenCalled();
  });

  it("refuses to delete the Domain Admins role", async () => {
    const repos = roleRepos("Domain Admins", true);
    const result = (await wire(new RoleController(), repos).delete("r1", req, res)) as JsonResult;
    expect(result.status).toBe(400);
    expect(repos.roleMember.deleteForRole).not.toHaveBeenCalled();
    expect(repos.role.delete).not.toHaveBeenCalled();
  });
});
