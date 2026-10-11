import "reflect-metadata";
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } } }));
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } bumpSiteCache() {} } }));

import { GlobalStyleController } from "../GlobalStyleController.js";

function makeController() {
  const repos = {
    globalStyle: {
      save: jest.fn(async (s: any) => ({ ...s, id: s.id ?? "gs1" })),
      convertAllToModel: (_churchId: string, rows: any[]) => rows
    }
  };
  const au = { churchId: "c1", checkAccess: () => true };
  const controller = new GlobalStyleController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  return { controller, repos };
}

describe("GlobalStyleController.save", () => {
  it("saves an array of styles", async () => {
    const { controller, repos } = makeController();
    const result = await controller.save({ body: [{ palette: "{}" }] } as any, {} as any);
    expect(repos.globalStyle.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", siteId: "" }));
    expect(result).toHaveLength(1);
  });

  // Production 500 (fix-log-errors 2026-10-10): "req.body.forEach is not a function" on a single-object body.
  it("accepts a single style object", async () => {
    const { controller, repos } = makeController();
    const result = await controller.save({ body: { palette: "{}", siteId: "s1" } } as any, {} as any);
    expect(repos.globalStyle.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", siteId: "s1" }));
    expect(result).toHaveLength(1);
  });
});
