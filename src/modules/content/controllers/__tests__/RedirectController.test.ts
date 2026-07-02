import "reflect-metadata";
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } } }));
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));

import { RedirectController } from "../RedirectController.js";

function makeController(overrides: { checkAccess?: boolean; count?: number } = {}) {
  const saved: any[] = [];
  const repos = {
    redirect: {
      save: jest.fn(async (r: any) => { saved.push(r); return r; }),
      count: jest.fn(async () => overrides.count ?? 0)
    }
  };
  const au = { churchId: "c1", checkAccess: () => overrides.checkAccess ?? true };
  const controller = new RedirectController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos, saved };
}

const run = (controller: RedirectController, body: any[]) =>
  (controller as any).save({ body }, {});

describe("RedirectController.save guards", () => {
  it("rejects without content-edit permission", async () => {
    const { controller, repos } = makeController({ checkAccess: false });
    const res = await run(controller, [{ fromPath: "/a", toPath: "/b" }]);
    expect(res.status).toBe(401);
    expect(repos.redirect.save).not.toHaveBeenCalled();
  });

  it("rejects a redirect whose fromPath equals toPath (case-insensitive)", async () => {
    const { controller, repos } = makeController();
    const res = await run(controller, [{ fromPath: "/About", toPath: "/about" }]);
    expect(res.status).toBe(400);
    expect(repos.redirect.save).not.toHaveBeenCalled();
  });

  it("rejects missing fromPath or toPath", async () => {
    const { controller } = makeController();
    const res = await run(controller, [{ fromPath: "/a", toPath: "" }]);
    expect(res.status).toBe(400);
  });

  it("rejects creates that would exceed the 200 cap", async () => {
    const { controller, repos } = makeController({ count: 200 });
    const res = await run(controller, [{ fromPath: "/a", toPath: "/b" }]);
    expect(res.status).toBe(400);
    expect(repos.redirect.save).not.toHaveBeenCalled();
  });

  it("allows updates even at the cap (no new rows)", async () => {
    const { controller, saved } = makeController({ count: 200 });
    await run(controller, [{ id: "x1", fromPath: "/a", toPath: "/b" }]);
    expect(saved).toHaveLength(1);
  });

  it("normalizes fromPath and trims toPath before saving", async () => {
    const { controller, saved } = makeController();
    await run(controller, [{ fromPath: "About-Us/", toPath: "  /welcome  " }]);
    expect(saved[0]).toMatchObject({ churchId: "c1", fromPath: "/about-us", toPath: "/welcome" });
  });
});
