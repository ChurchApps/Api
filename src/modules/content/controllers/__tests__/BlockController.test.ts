import "reflect-metadata";
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getAll: () => [], getIds: () => [] } }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } } }));
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } bumpSiteCache() {} } }));
jest.mock("../../helpers/TreeHelper", () => ({ TreeHelper: { populateAnswers: (items: any[]) => items.forEach((i) => { i.answers = JSON.parse(i.answersJSON || "{}"); }) } }));

import { BlockController } from "../BlockController.js";

const section = (id: string, extra: any = {}) => ({ id, answersJSON: "{}", stylesJSON: "{}", animationsJSON: "{}", ...extra });
const element = (id: string, answers: any = {}) => ({ id, answersJSON: JSON.stringify(answers), stylesJSON: "{}", animationsJSON: "{}" });

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
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  const bumpSiteCache = jest.fn();
  (controller as any).bumpSiteCache = bumpSiteCache;
  return { controller, repos, bumpSiteCache, blockId };
}

const ids = (fn: jest.Mock) => fn.mock.calls.map((c) => c[1]);

describe("BlockController.delete cascade", () => {
  it("deletes the block's own sections/elements and every consumer of it", async () => {
    const { controller, repos, bumpSiteCache } = makeController();
    const res = await (controller as any).delete("B", {}, {});
    expect(res).toEqual({});
    expect(ids(repos.element.delete as jest.Mock).sort()).toEqual(["be1", "be2", "e1"]);
    expect(ids(repos.section.delete as jest.Mock).sort()).toEqual(["bs1", "s1"]);
    expect(repos.block.delete).toHaveBeenCalledWith("c1", "B");
    expect(bumpSiteCache).toHaveBeenCalledTimes(1);
  });

  it("rejects without content-edit permission and deletes nothing", async () => {
    const { controller, repos, bumpSiteCache } = makeController({ checkAccess: false });
    const res = await (controller as any).delete("B", {}, {});
    expect(res.status).toBe(401);
    expect(repos.block.delete).not.toHaveBeenCalled();
    expect(repos.section.delete).not.toHaveBeenCalled();
    expect(repos.element.delete).not.toHaveBeenCalled();
    expect(bumpSiteCache).not.toHaveBeenCalled();
  });

  it("is a no-op for an unknown block id", async () => {
    const { controller, repos } = makeController();
    const res = await (controller as any).delete("nope", {}, {});
    expect(res).toEqual({});
    expect(repos.section.delete).not.toHaveBeenCalled();
    expect(repos.element.delete).not.toHaveBeenCalled();
  });
});
