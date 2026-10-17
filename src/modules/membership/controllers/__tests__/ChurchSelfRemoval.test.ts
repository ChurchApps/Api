import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { roles: { view: "rView", edit: "rEdit" }, people: { edit: "pEdit" }, server: { admin: "admin" } } }));

import { RoleMemberController } from "../RoleMemberController.js";
import { UserChurchController } from "../UserChurchController.js";

function wire(controller: any, repos: any, access: (perm: string) => boolean = () => false) {
  const au = { id: "u1", churchId: "current", checkAccess: access };
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(au);
  controller.json = (obj: any, status: number) => ({ obj, status });
  return controller;
}

describe("Removing a church from your own church list (#1270)", () => {
  it("deletes the userChurches row for the picked church, not the current one", async () => {
    const repos = { userChurch: { deleteRecord: jest.fn() } };
    const controller = wire(new UserChurchController(), repos);
    await controller.deleteRecord("u1", "other", "p-other", {}, {});
    expect(repos.userChurch.deleteRecord).toHaveBeenCalledWith("u1", "other", "p-other");
  });

  it("deletes role memberships in the picked church and leaves the current church's roles alone", async () => {
    const repos = { roleMember: { deleteSelf: jest.fn() } };
    const controller = wire(new RoleMemberController(), repos);
    await controller.deleteSelf("other", "u1", {}, {});
    expect(repos.roleMember.deleteSelf).toHaveBeenCalledWith("other", "u1");
  });

  it("keeps an admin acting on another user locked to their own church", async () => {
    const ucRepos = { userChurch: { deleteRecord: jest.fn() } };
    const rmRepos = { roleMember: { deleteSelf: jest.fn() } };
    const uc = wire(new UserChurchController(), ucRepos, () => true);
    const rm = wire(new RoleMemberController(), rmRepos, () => true);
    const r1 = await uc.deleteRecord("u2", "other", "p2", {}, {});
    const r2 = await rm.deleteSelf("other", "u2", {}, {});
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(ucRepos.userChurch.deleteRecord).not.toHaveBeenCalled();
    expect(rmRepos.roleMember.deleteSelf).not.toHaveBeenCalled();
  });

  it("still lets an admin remove another user within their own church", async () => {
    const repos = { userChurch: { deleteRecord: jest.fn() }, roleMember: { deleteSelf: jest.fn() } };
    const uc = wire(new UserChurchController(), repos, () => true);
    const rm = wire(new RoleMemberController(), repos, () => true);
    await uc.deleteRecord("u2", "current", "p2", {}, {});
    await rm.deleteSelf("current", "u2", {}, {});
    expect(repos.userChurch.deleteRecord).toHaveBeenCalledWith("u2", "current", "p2");
    expect(repos.roleMember.deleteSelf).toHaveBeenCalledWith("current", "u2");
  });
});
