import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { settings: { edit: "settingsEdit" } }, FileStorageHelper: {}, Environment: {} }));
jest.mock("../../models/index", () => ({}));
jest.mock("@churchapps/apihelper", () => ({}));

import { MembershipSettingController } from "../SettingController.js";

function settingController(access: string[]) {
  const repos: any = { setting: { delete: jest.fn(async () => {}) } };
  const au = { id: "u1", churchId: "c1", checkAccess: (perm: any) => access.includes(perm) };
  const controller = new MembershipSettingController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

// ChurchAppsSupport#1150: B1Admin disables grade promotion with DELETE /membership/settings/:id.
describe("MembershipSettingController delete", () => {
  it("deletes the setting scoped to the caller's church", async () => {
    const { controller, repos } = settingController(["settingsEdit"]);
    expect(typeof (controller as any).delete).toBe("function");
    await (controller as any).delete("s1", {}, {});
    expect(repos.setting.delete).toHaveBeenCalledWith("c1", "s1");
  });

  it("requires settings edit access", async () => {
    const { controller, repos } = settingController([]);
    expect(typeof (controller as any).delete).toBe("function");
    const result: any = await (controller as any).delete("s1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.setting.delete).not.toHaveBeenCalled();
  });
});
