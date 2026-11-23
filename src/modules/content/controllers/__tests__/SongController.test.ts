import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } } }));
jest.mock("../../helpers/SongHelper", () => ({ SongHelper: { importSongs: jest.fn() } }));
jest.mock("../../helpers/StorageResolver", () => ({ StorageResolver: { forFile: jest.fn(), keyFromUrl: jest.fn((u: string) => (u || "").split("?")[0]) } }));

import { SongController } from "../SongController.js";
import { StorageResolver } from "../../helpers/StorageResolver.js";
import { Arrangement, File, Song } from "../../models/index.js";

type JsonResult = { obj: { error?: string }; status: number };
const req = (body?: unknown) => ({ body } as express.Request);
const res = {} as express.Response;

function setup() {
  const repos = { song: { save: jest.fn(async (s: Song) => ({ ...s, id: "s1" })) } };
  const au = { churchId: "c1", checkAccess: () => true };
  const controller = new SongController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("SongController POST / body shape (#1196)", () => {
  it("accepts a single song object", async () => {
    const { controller } = setup();
    const result = await controller.post(req({ songDetailId: "sd1", name: "Amazing Grace" }), res);
    expect(result).toEqual([{ id: "s1", churchId: "c1", songDetailId: "sd1", name: "Amazing Grace" }]);
  });

  it("still accepts an array", async () => {
    const { controller } = setup();
    const result = await controller.post(req([{ songDetailId: "sd1", name: "A" }, { songDetailId: "sd2", name: "B" }]), res);
    expect(result).toHaveLength(2);
  });

  it("returns 400 pointing at /content/songs/import for a new song with no songDetailId", async () => {
    const { controller, repos } = setup();
    const result = (await controller.post(req({ title: "Amazing Grace", author: "John Newton", ccliNumber: "22025" }), res)) as JsonResult;
    expect(result.status).toBe(400);
    expect(result.obj.error).toContain("/content/songs/import");
    expect(repos.song.save).not.toHaveBeenCalled();
  });
});

describe("SongController.delete cascades to arrangements (FreeShow#3999)", () => {
  function deleteSetup(opts: { arrangements?: Arrangement[]; files?: Record<string, File[]>; checkAccess?: boolean } = {}) {
    const remove = jest.fn(async (_key: string): Promise<void> => undefined);
    const repos = {
      song: { delete: jest.fn(async (): Promise<void> => undefined) },
      arrangement: {
        loadBySongId: jest.fn(async () => opts.arrangements ?? []),
        delete: jest.fn(async (): Promise<void> => undefined)
      },
      arrangementKey: { deleteForArrangement: jest.fn(async (): Promise<void> => undefined) },
      file: {
        loadForContent: jest.fn(async (_c: string, _t: string, id: string) => (opts.files ?? {})[id] ?? []),
        deleteForContent: jest.fn(async (): Promise<void> => undefined)
      },
      storageProvider: {}
    };
    const au = { churchId: "c1", checkAccess: () => opts.checkAccess ?? true };
    const controller = new SongController();
    Object.assign(controller, {
      repos,
      actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
      json: (obj: unknown, status: number) => ({ obj, status })
    });
    (StorageResolver.forFile as jest.Mock).mockResolvedValue({ provider: { remove } });
    return { controller, repos, remove };
  }

  it("deletes every arrangement, its keys and files, then the song", async () => {
    const { controller, repos, remove } = deleteSetup({
      arrangements: [{ id: "a1", songId: "s1", freeShowId: "fs1" }, { id: "a2", songId: "s1" }],
      files: { a2: [{ id: "f1", externalId: "ext-1" }] }
    });
    await controller.delete("s1", req(), res);
    expect(repos.arrangement.loadBySongId).toHaveBeenCalledWith("c1", "s1");
    expect(repos.arrangement.delete).toHaveBeenCalledWith("c1", "a1");
    expect(repos.arrangement.delete).toHaveBeenCalledWith("c1", "a2");
    expect(repos.arrangementKey.deleteForArrangement).toHaveBeenCalledWith("c1", "a1");
    expect(repos.arrangementKey.deleteForArrangement).toHaveBeenCalledWith("c1", "a2");
    expect(remove).toHaveBeenCalledWith("ext-1");
    expect(repos.file.deleteForContent).toHaveBeenCalledTimes(1);
    expect(repos.file.deleteForContent).toHaveBeenCalledWith("c1", "arrangement", "a2");
    expect(repos.song.delete).toHaveBeenCalledWith("c1", "s1");
  });

  it("still deletes a song with no arrangements", async () => {
    const { controller, repos } = deleteSetup();
    await controller.delete("s1", req(), res);
    expect(repos.arrangement.delete).not.toHaveBeenCalled();
    expect(repos.song.delete).toHaveBeenCalledWith("c1", "s1");
  });

  it("rejects without content-edit permission", async () => {
    const { controller, repos } = deleteSetup({ checkAccess: false, arrangements: [{ id: "a1" }] });
    const result = (await controller.delete("s1", req(), res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.arrangement.delete).not.toHaveBeenCalled();
    expect(repos.song.delete).not.toHaveBeenCalled();
  });
});
