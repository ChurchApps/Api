import "reflect-metadata";
import express from "express";
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } } }));
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } bumpSiteCache() {} } }));

import { GlobalStyleController } from "../GlobalStyleController.js";
import { GlobalStyle } from "../../models/index.js";

function makeController() {
  const repos = {
    globalStyle: {
      save: jest.fn(async (s: GlobalStyle) => ({ ...s, id: s.id ?? "gs1" })),
      convertAllToModel: (_churchId: string, rows: GlobalStyle[]) => rows
    }
  };
  const au = { churchId: "c1", checkAccess: () => true };
  const controller = new GlobalStyleController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au)
  });
  return { controller, repos };
}

describe("GlobalStyleController.save", () => {
  it("saves an array of styles", async () => {
    const { controller, repos } = makeController();
    const result = await controller.save({ body: [{ palette: "{}" }] } as express.Request, {} as express.Response);
    expect(repos.globalStyle.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", siteId: "" }));
    expect(result).toHaveLength(1);
  });

  // Production 500 (fix-log-errors 2026-10-10): "req.body.forEach is not a function" on a single-object body.
  it("accepts a single style object", async () => {
    const { controller, repos } = makeController();
    const result = await controller.save({ body: { palette: "{}", siteId: "s1" } } as express.Request, {} as express.Response);
    expect(repos.globalStyle.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", siteId: "s1" }));
    expect(result).toHaveLength(1);
  });
});
