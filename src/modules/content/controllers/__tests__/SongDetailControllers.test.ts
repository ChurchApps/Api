import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" }, server: { admin: "serverAdmin" } } }));
jest.mock("../../helpers/MusicBrainzHelper", () => ({ MusicBrainzHelper: { appendDetailsById: jest.fn(), appendDetails: jest.fn() } }));
jest.mock("../../helpers/PraiseChartsHelper", () => ({ PraiseChartsHelper: { load: jest.fn() } }));

import { SongDetailsController } from "../SongDetailsController.js";
import { SongDetailLinkController } from "../SongDetailLinkController.js";
import { SongDetail, SongDetailLink } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
const req = (body?: unknown) => ({ body } as express.Request);
const res = {} as express.Response;
const statusOf = (result: unknown) => (result as JsonResult).status;

function setup<T extends SongDetailsController | SongDetailLinkController>(Ctrl: new () => T, opts: { exclusive?: boolean; serverAdmin?: boolean; noEdit?: boolean } = {}) {
  const repos = {
    songDetail: {
      isExclusiveTo: jest.fn(async () => opts.exclusive ?? false),
      loadGlobal: jest.fn(async () => ({ id: "sd1", praiseChartsId: "pc-real" })),
      save: jest.fn(async (sd: SongDetail) => sd)
    },
    songDetailLink: {
      load: jest.fn(async () => ({ id: "l1", songDetailId: "sd1", service: "Spotify" })),
      save: jest.fn(async (l: SongDetailLink) => l),
      delete: jest.fn(),
      loadForChurchByService: jest.fn(async () => [{ id: "l1", songDetailId: "sd1", service: "CCLI", serviceKey: "22025" }])
    }
  };
  const au = { churchId: "c1", checkAccess: (p: string) => (p === "contentEdit" && !opts.noEdit) || (p === "serverAdmin" && !!opts.serverAdmin) };
  const controller = new Ctrl();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("SongDetailsController.save (global rows)", () => {
  it("refuses to update a song detail shared with other churches", async () => {
    const { controller, repos } = setup(SongDetailsController);
    const result = await controller.save(req([{ id: "sd1", title: "Hacked" }]), res);
    expect(statusOf(result)).toBe(403);
    expect(repos.songDetail.save).not.toHaveBeenCalled();
  });

  it("updates an exclusive row but keeps its praiseChartsId", async () => {
    const { controller, repos } = setup(SongDetailsController, { exclusive: true });
    await controller.save(req([{ id: "sd1", title: "Mine", praiseChartsId: "pc-popular" }]), res);
    expect(repos.songDetail.save).toHaveBeenCalledWith(expect.objectContaining({ title: "Mine", praiseChartsId: "pc-real" }));
  });

  it("allows creates but strips praiseChartsId", async () => {
    const { controller, repos } = setup(SongDetailsController);
    await controller.save(req([{ title: "New", praiseChartsId: "pc-popular" }]), res);
    expect(repos.songDetail.save.mock.calls[0][0].praiseChartsId).toBeUndefined();
  });

  it("lets a server admin update shared rows", async () => {
    const { controller, repos } = setup(SongDetailsController, { serverAdmin: true });
    await controller.save(req([{ id: "sd1", title: "Fix" }]), res);
    expect(repos.songDetail.save).toHaveBeenCalled();
  });
});

describe("SongDetailLinkController (global rows)", () => {
  it("rebuilds the url server-side for new links on shared rows", async () => {
    const { controller, repos } = setup(SongDetailLinkController);
    await controller.save(req([{ songDetailId: "sd1", service: "Spotify", serviceKey: "abc", url: "https://evil.example" }]), res);
    expect(repos.songDetailLink.save).toHaveBeenCalledWith(expect.objectContaining({ url: "https://open.spotify.com/track/abc" }));
  });

  it("rejects unknown services on shared rows", async () => {
    const { controller, repos } = setup(SongDetailLinkController);
    const result = await controller.save(req([{ songDetailId: "sd1", service: "Other", serviceKey: "x", url: "https://evil.example" }]), res);
    expect(statusOf(result)).toBe(400);
    expect(repos.songDetailLink.save).not.toHaveBeenCalled();
  });

  it("refuses to edit or delete links on shared rows", async () => {
    const { controller, repos } = setup(SongDetailLinkController);
    const edit = await controller.save(req([{ id: "l1", songDetailId: "sd1", service: "Spotify", serviceKey: "abc" }]), res);
    expect(statusOf(edit)).toBe(403);
    const del = await controller.delete("l1", req(), res);
    expect(statusOf(del)).toBe(403);
    expect(repos.songDetailLink.delete).not.toHaveBeenCalled();
  });

  it("allows edits and deletes on exclusive rows", async () => {
    const { controller, repos } = setup(SongDetailLinkController, { exclusive: true });
    await controller.save(req([{ id: "l1", songDetailId: "sd1", service: "Spotify", serviceKey: "abc" }]), res);
    await controller.delete("l1", req(), res);
    expect(repos.songDetailLink.save).toHaveBeenCalled();
    expect(repos.songDetailLink.delete).toHaveBeenCalledWith("l1");
  });
});

// Production log: POST /content/songDetailLinks returned 500 "Error fetching data from MusicBrainz: Bad Request"
// after saving a MusicBrainz link whose key was not a recording id.
describe("SongDetailLinkController MusicBrainz key", () => {
  it("rejects a key that is not a MusicBrainz recording id with 400 before saving", async () => {
    const { controller, repos } = setup(SongDetailLinkController, { exclusive: true });
    const result = await controller.save(req([{ songDetailId: "sd1", service: "MusicBrainz", serviceKey: "amazing-grace" }]), res);
    expect(statusOf(result)).toBe(400);
    expect(repos.songDetailLink.save).not.toHaveBeenCalled();
  });

  it("saves a real recording id", async () => {
    const { controller, repos } = setup(SongDetailLinkController, { exclusive: true });
    const key = "b1a9c0e9-d987-4042-ae91-78d6a3267d69";
    const result = await controller.save(req([{ songDetailId: "sd1", service: "MusicBrainz", serviceKey: key }]), res);
    expect((result as SongDetailLink[])[0].url).toBe("https://musicbrainz.org/recording/" + key);
    expect(repos.songDetailLink.save).toHaveBeenCalled();
  });
});

describe("SongDetailLinkController.getForChurch", () => {
  it("returns the church's links for one service", async () => {
    const { controller, repos } = setup(SongDetailLinkController);
    const result = await controller.getForChurch("CCLI", req(), res);
    expect(repos.songDetailLink.loadForChurchByService).toHaveBeenCalledWith("c1", "CCLI");
    expect(result).toEqual([expect.objectContaining({ serviceKey: "22025" })]);
  });

  it("refuses a user who cannot edit songs", async () => {
    const { controller, repos } = setup(SongDetailLinkController, { noEdit: true });
    expect(statusOf(await controller.getForChurch("CCLI", req(), res))).toBe(401);
    expect(repos.songDetailLink.loadForChurchByService).not.toHaveBeenCalled();
  });
});
