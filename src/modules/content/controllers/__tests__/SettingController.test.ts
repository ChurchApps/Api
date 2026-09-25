import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { settings: { edit: "settingsEdit" } }, Environment: { contentRoot: "https://cdn.test" } }));
jest.mock("@churchapps/apihelper", () => ({ FileStorageHelper: { store: jest.fn() } }));

import { ContentSettingController } from "../SettingController.js";

function makeController(au: any) {
  const repos: any = { setting: { loadUser: jest.fn(async () => []), save: jest.fn(async (s: any) => s), deleteForUser: jest.fn(), convertAllToModel: (_c: string, d: any) => d } };
  const controller = new ContentSettingController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("ContentSettingController /my", () => {
  it("rejects anonymous read, write and delete", async () => {
    const { controller, repos } = makeController({ id: "", churchId: "", checkAccess: () => false });
    expect((await controller.my({} as any, {} as any)).status).toBe(401);
    expect((await controller.postMy({ body: [{ keyName: "x", value: "data:image/png;base64,AA==" }] } as any, {} as any)).status).toBe(401);
    expect((await controller.delete("s1", {} as any, {} as any)).status).toBe(401);
    expect(repos.setting.save).not.toHaveBeenCalled();
    expect(repos.setting.deleteForUser).not.toHaveBeenCalled();
  });

  it("reads the signed-in user's settings", async () => {
    const { controller, repos } = makeController({ id: "u1", churchId: "c1", checkAccess: () => false });
    await controller.my({} as any, {} as any);
    expect(repos.setting.loadUser).toHaveBeenCalledWith("c1", "u1");
  });
});
