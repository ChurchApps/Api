import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { settings: { edit: "settingsEdit" } }, FileStorageHelper: {}, Environment: {} }));
jest.mock("../../models/index", () => ({}));
jest.mock("@churchapps/apihelper", () => ({}));

import express from "express";
import { MembershipSettingController } from "../SettingController.js";

const req = {} as express.Request<{}, {}, null>;
const res = {} as express.Response;

function settingController(access: string[]) {
  const repos = { setting: { delete: jest.fn(async () => {}) } };
  const au = { id: "u1", churchId: "c1", checkAccess: (perm: string) => access.includes(perm) };
  const controller = new MembershipSettingController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

// ChurchAppsSupport#1150: B1Admin disables grade promotion with DELETE /membership/settings/:id.
describe("MembershipSettingController delete", () => {
  it("deletes the setting scoped to the caller's church", async () => {
    const { controller, repos } = settingController(["settingsEdit"]);
    expect(typeof controller.delete).toBe("function");
    await controller.delete("s1", req, res);
    expect(repos.setting.delete).toHaveBeenCalledWith("c1", "s1");
  });

  it("requires settings edit access", async () => {
    const { controller, repos } = settingController([]);
    expect(typeof controller.delete).toBe("function");
    const result = (await controller.delete("s1", req, res)) as { status: number };
    expect(result.status).toBe(401);
    expect(repos.setting.delete).not.toHaveBeenCalled();
  });
});
