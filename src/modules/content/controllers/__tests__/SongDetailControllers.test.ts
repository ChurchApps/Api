import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" }, server: { admin: "serverAdmin" } } }));
jest.mock("../../helpers/MusicBrainzHelper", () => ({ MusicBrainzHelper: { appendDetailsById: jest.fn(), appendDetails: jest.fn() } }));
jest.mock("../../helpers/PraiseChartsHelper", () => ({ PraiseChartsHelper: { load: jest.fn() } }));

import { SongDetailsController } from "../SongDetailsController.js";
import { SongDetailLinkController } from "../SongDetailLinkController.js";

function setup(Ctrl: any, opts: any = {}) {
  const repos = {
    songDetail: {
      isExclusiveTo: jest.fn(async () => opts.exclusive ?? false),
      loadGlobal: jest.fn(async () => ({ id: "sd1", praiseChartsId: "pc-real" })),
      save: jest.fn(async (sd: any) => sd)
    },
    songDetailLink: {
      load: jest.fn(async () => ({ id: "l1", songDetailId: "sd1", service: "Spotify" })),
      save: jest.fn(async (l: any) => l),
      delete: jest.fn()
    }
  };
  const au = { churchId: "c1", checkAccess: (p: string) => p === "contentEdit" || (p === "serverAdmin" && !!opts.serverAdmin) };
  const controller = new Ctrl();
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(au);
  controller.json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("SongDetailsController.save (global rows)", () => {
  it("refuses to update a song detail shared with other churches", async () => {
    const { controller, repos } = setup(SongDetailsController);
    const result = await controller.save({ body: [{ id: "sd1", title: "Hacked" }] }, {});
    expect(result.status).toBe(403);
    expect(repos.songDetail.save).not.toHaveBeenCalled();
  });

  it("updates an exclusive row but keeps its praiseChartsId", async () => {
    const { controller, repos } = setup(SongDetailsController, { exclusive: true });
    await controller.save({ body: [{ id: "sd1", title: "Mine", praiseChartsId: "pc-popular" }] }, {});
    expect(repos.songDetail.save).toHaveBeenCalledWith(expect.objectContaining({ title: "Mine", praiseChartsId: "pc-real" }));
  });

  it("allows creates but strips praiseChartsId", async () => {
    const { controller, repos } = setup(SongDetailsController);
    await controller.save({ body: [{ title: "New", praiseChartsId: "pc-popular" }] }, {});
    expect(repos.songDetail.save.mock.calls[0][0].praiseChartsId).toBeUndefined();
  });

  it("lets a server admin update shared rows", async () => {
    const { controller, repos } = setup(SongDetailsController, { serverAdmin: true });
    await controller.save({ body: [{ id: "sd1", title: "Fix" }] }, {});
    expect(repos.songDetail.save).toHaveBeenCalled();
  });
});

describe("SongDetailLinkController (global rows)", () => {
  it("rebuilds the url server-side for new links on shared rows", async () => {
    const { controller, repos } = setup(SongDetailLinkController);
    await controller.save({ body: [{ songDetailId: "sd1", service: "Spotify", serviceKey: "abc", url: "https://evil.example" }] }, {});
    expect(repos.songDetailLink.save).toHaveBeenCalledWith(expect.objectContaining({ url: "https://open.spotify.com/track/abc" }));
  });

  it("rejects unknown services on shared rows", async () => {
    const { controller, repos } = setup(SongDetailLinkController);
    const result = await controller.save({ body: [{ songDetailId: "sd1", service: "Other", serviceKey: "x", url: "https://evil.example" }] }, {});
    expect(result.status).toBe(400);
    expect(repos.songDetailLink.save).not.toHaveBeenCalled();
  });

  it("refuses to edit or delete links on shared rows", async () => {
    const { controller, repos } = setup(SongDetailLinkController);
    const edit = await controller.save({ body: [{ id: "l1", songDetailId: "sd1", service: "Spotify", serviceKey: "abc" }] }, {});
    expect(edit.status).toBe(403);
    const del = await controller.delete("l1", {}, {});
    expect(del.status).toBe(403);
    expect(repos.songDetailLink.delete).not.toHaveBeenCalled();
  });

  it("allows edits and deletes on exclusive rows", async () => {
    const { controller, repos } = setup(SongDetailLinkController, { exclusive: true });
    await controller.save({ body: [{ id: "l1", songDetailId: "sd1", service: "Spotify", serviceKey: "abc" }] }, {});
    await controller.delete("l1", {}, {});
    expect(repos.songDetailLink.save).toHaveBeenCalled();
    expect(repos.songDetailLink.delete).toHaveBeenCalledWith("l1");
  });
});
