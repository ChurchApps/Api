import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { settings: { edit: "settingsEdit" }, content: { edit: "contentEdit" } }, Environment: { contentRoot: "https://cdn.test" } }));
jest.mock("@churchapps/apihelper", () => ({ FileStorageHelper: { store: jest.fn() } }));

import { ContentSettingController } from "../SettingController.js";
import { Setting } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
type TestUser = { id: string; churchId: string; checkAccess: (p: string) => boolean };

const req = (body?: unknown) => ({ body } as express.Request);
const res = {} as express.Response;

function makeController(au: TestUser) {
  const repos = { setting: { loadUser: jest.fn(async (): Promise<Setting[]> => []), save: jest.fn(async (s: Setting) => s), deleteForUser: jest.fn(), convertAllToModel: (_c: string, d: Setting[]) => d } };
  const controller = new ContentSettingController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: TestUser) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("ContentSettingController /my", () => {
  it("rejects anonymous read, write and delete", async () => {
    const { controller, repos } = makeController({ id: "", churchId: "", checkAccess: () => false });
    expect(((await controller.my(req(), res)) as JsonResult).status).toBe(401);
    expect(((await controller.postMy(req([{ keyName: "x", value: "data:image/png;base64,AA==" }]), res)) as JsonResult).status).toBe(401);
    expect(((await controller.delete("s1", req(), res)) as JsonResult).status).toBe(401);
    expect(repos.setting.save).not.toHaveBeenCalled();
    expect(repos.setting.deleteForUser).not.toHaveBeenCalled();
  });

  it("reads the signed-in user's settings", async () => {
    const { controller, repos } = makeController({ id: "u1", churchId: "c1", checkAccess: () => false });
    await controller.my(req(), res);
    expect(repos.setting.loadUser).toHaveBeenCalledWith("c1", "u1");
  });
});

describe("ContentSettingController save", () => {
  const can = (...perms: string[]) => ({ id: "u1", churchId: "c1", checkAccess: (p: string) => perms.includes(p) });
  const footer = [{ keyName: "blogFooterHtml", value: "<div></div>", public: 1 }];

  it("refuses the blog footer HTML without content edit, since it runs on the public site", async () => {
    const { controller, repos } = makeController(can("settingsEdit"));
    const result = (await controller.post(req(footer), res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.setting.save).not.toHaveBeenCalled();
  });

  it("saves the blog footer HTML for someone who holds both permissions", async () => {
    const { controller, repos } = makeController(can("settingsEdit", "contentEdit"));
    await controller.post(req(footer), res);
    expect(repos.setting.save).toHaveBeenCalledWith(expect.objectContaining({ keyName: "blogFooterHtml", churchId: "c1" }));
  });

  it("still saves ordinary settings with settings edit alone", async () => {
    const { controller, repos } = makeController(can("settingsEdit"));
    await controller.post(req([{ keyName: "hidePublicSite", value: "true" }]), res);
    expect(repos.setting.save).toHaveBeenCalledWith(expect.objectContaining({ keyName: "hidePublicSite", churchId: "c1" }));
  });
});
