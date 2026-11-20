import "reflect-metadata";
import express from "express";
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getAll: () => [], getIds: () => [] } }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } } }));
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } bumpSiteCache() {} } }));
jest.mock("../../helpers/TreeHelper", () => ({ TreeHelper: { populateAnswers: (items: { answers?: unknown; answersJSON?: string }[]) => items.forEach((i) => { i.answers = JSON.parse(i.answersJSON || "{}"); }) } }));

import { BlockController } from "../BlockController.js";
import { Section } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };

const section = (id: string, extra: Partial<Section> = {}) => ({ id, answersJSON: "{}", stylesJSON: "{}", animationsJSON: "{}", ...extra });
const element = (id: string, answers: Record<string, unknown> = {}) => ({ id, answersJSON: JSON.stringify(answers), stylesJSON: "{}", animationsJSON: "{}" });

function makeController(overrides: { checkAccess?: boolean; blockId?: string } = {}) {
  const blockId = overrides.blockId ?? "B";
  const repos = {
    block: { delete: jest.fn(async () => {}) },
    section: {
      loadForBlock: jest.fn(async (_c: string, id: string) => (id === "B" ? [section("bs1")] : [])),
      loadAll: jest.fn(async () => [section("s1", { targetBlockId: "B" }), section("s2"), section("s3", { targetBlockId: "OTHER" })]),
      delete: jest.fn(async () => {})
    },
    element: {
      loadForBlock: jest.fn(async (_c: string, id: string) => (id === "B" ? [element("be1"), element("be2")] : [])),
      loadAll: jest.fn(async () => [element("e1", { targetBlockId: "B" }), element("e2", { text: "hi" }), element("e3", { targetBlockId: "OTHER" })]),
      delete: jest.fn(async () => {})
    }
  };
  const au = { churchId: "c1", checkAccess: () => overrides.checkAccess ?? true };
  const controller = new BlockController();
  const bumpSiteCache = jest.fn();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status }),
    bumpSiteCache
  });
  return { controller, repos, bumpSiteCache, blockId };
}

const ids = (fn: jest.Mock) => fn.mock.calls.map((c) => c[1]);

describe("BlockController.delete cascade", () => {
  it("deletes the block's own sections/elements and every consumer of it", async () => {
    const { controller, repos, bumpSiteCache } = makeController();
    const res = await controller.delete("B", {} as express.Request, {} as express.Response);
    expect(res).toEqual({});
    expect(ids(repos.element.delete as jest.Mock).sort()).toEqual(["be1", "be2", "e1"]);
    expect(ids(repos.section.delete as jest.Mock).sort()).toEqual(["bs1", "s1"]);
    expect(repos.block.delete).toHaveBeenCalledWith("c1", "B");
    expect(bumpSiteCache).toHaveBeenCalledTimes(1);
  });

  it("rejects without content-edit permission and deletes nothing", async () => {
    const { controller, repos, bumpSiteCache } = makeController({ checkAccess: false });
    const res = await controller.delete("B", {} as express.Request, {} as express.Response);
    expect((res as JsonResult).status).toBe(401);
    expect(repos.block.delete).not.toHaveBeenCalled();
    expect(repos.section.delete).not.toHaveBeenCalled();
    expect(repos.element.delete).not.toHaveBeenCalled();
    expect(bumpSiteCache).not.toHaveBeenCalled();
  });

  it("is a no-op for an unknown block id", async () => {
    const { controller, repos } = makeController();
    const res = await controller.delete("nope", {} as express.Request, {} as express.Response);
    expect(res).toEqual({});
    expect(repos.section.delete).not.toHaveBeenCalled();
    expect(repos.element.delete).not.toHaveBeenCalled();
  });
});
