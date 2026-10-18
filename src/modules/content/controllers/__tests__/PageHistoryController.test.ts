import "reflect-metadata";
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } } }));
jest.mock("../../helpers/TreeHelper.js", () => ({ TreeHelper: {} }));
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } bumpSiteCache() {} } }));

import { PageHistoryController } from "../PageHistoryController.js";

// Production: GET /content/pageHistory/page/:pageId returned 50 full page snapshots; for large pages the JSON passed
// Lambda's 6MB response limit (LAMBDA_RUNTIME 413) and the editor's undo history failed to load.
const LAMBDA_LIMIT = 6291556;

function make(rows: any[]) {
  const repos: any = { pageHistory: { loadForPage: jest.fn(async () => rows), loadForBlock: jest.fn(async () => rows) } };
  const controller: any = new PageHistoryController();
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", checkAccess: () => true });
  return controller;
}

const history = (count: number, snapshotBytes: number) =>
  Array.from({ length: count }, (_, i) => ({ id: "h" + i, pageId: "p1", snapshotJSON: JSON.stringify({ html: "x".repeat(snapshotBytes) }), createdDate: new Date(2026, 9, 17, 12, 60 - i) }));

describe("PageHistoryController list size", () => {
  it("keeps the page history response under Lambda's limit, newest entries first", async () => {
    const result = await make(history(50, 200_000)).getForPage("p1", {}, {});
    expect(JSON.stringify(result).length).toBeLessThan(LAMBDA_LIMIT);
    expect(result[0].id).toBe("h0");
    expect(result.length).toBeGreaterThan(1);
  });

  it("does the same for block history", async () => {
    const result = await make(history(50, 200_000)).getForBlock("b1", {}, {});
    expect(JSON.stringify(result).length).toBeLessThan(LAMBDA_LIMIT);
  });

  it("returns everything when it fits", async () => {
    expect(await make(history(50, 1_000)).getForPage("p1", {}, {})).toHaveLength(50);
  });

  it("still returns the newest entry when it alone is large", async () => {
    expect(await make(history(3, 3_000_000)).getForPage("p1", {}, {})).toHaveLength(1);
  });
});
