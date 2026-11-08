import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } } }));
jest.mock("../../helpers/StorageResolver", () => ({ StorageResolver: { forFile: jest.fn(), keyFromUrl: jest.fn((u: string) => (u || "").split("?")[0]) } }));

import { ArrangementController } from "../ArrangementController.js";
import { StorageResolver } from "../../helpers/StorageResolver.js";

function makeController(opts: any = {}) {
  const files = opts.files ?? [];
  const remove = jest.fn(async () => undefined);
  const repos = {
    arrangement: {
      load: jest.fn(async () => opts.existing ?? null),
      delete: jest.fn(async () => undefined),
      loadBySongId: jest.fn(async () => opts.remaining ?? [{ id: "other" }]),
      loadAll: jest.fn(async () => (opts.freeShowIds ?? []).map((freeShowId: string) => ({ id: "a-" + freeShowId, lyrics: "long lyrics", freeShowId }))),
      loadFreeShowIds: jest.fn(async () => opts.freeShowIds ?? [])
    },
    arrangementKey: { deleteForArrangement: jest.fn(async () => undefined) },
    file: {
      loadForContent: jest.fn(async () => files),
      deleteForContent: jest.fn(async () => undefined)
    },
    song: { delete: jest.fn(async () => undefined) },
    storageProvider: {}
  };
  const au = { churchId: "c1", checkAccess: () => opts.checkAccess ?? true };
  const controller = new ArrangementController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  (StorageResolver.forFile as jest.Mock).mockResolvedValue({ provider: { remove } });
  return { controller, repos, remove };
}

describe("ArrangementController.delete", () => {
  beforeEach(() => {
    (StorageResolver.forFile as jest.Mock).mockReset();
    (StorageResolver.keyFromUrl as jest.Mock).mockClear();
  });

  it("rejects without content-edit permission", async () => {
    const { controller, repos } = makeController({ checkAccess: false });
    const result: any = await (controller as any).delete("a1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.arrangement.delete).not.toHaveBeenCalled();
  });

  it("removes arrangement audio from storage and deletes the file rows", async () => {
    const files = [
      { id: "f1", externalId: "ext-1", contentPath: "https://cdn.test/f1.mp3" },
      { id: "f2", contentPath: "https://cdn.test/f2.mp3?dt=1" }
    ];
    const { controller, repos, remove } = makeController({ existing: { id: "a1", songId: "s1" }, files });
    await (controller as any).delete("a1", {}, {});
    expect(repos.arrangementKey.deleteForArrangement).toHaveBeenCalledWith("c1", "a1");
    expect(repos.file.loadForContent).toHaveBeenCalledWith("c1", "arrangement", "a1");
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith("ext-1");
    expect(StorageResolver.keyFromUrl).toHaveBeenCalledWith("https://cdn.test/f2.mp3?dt=1");
    expect(repos.file.deleteForContent).toHaveBeenCalledWith("c1", "arrangement", "a1");
    expect(repos.song.delete).not.toHaveBeenCalled();
  });

  it("skips file cleanup when the arrangement has no files", async () => {
    const { controller, repos, remove } = makeController({ existing: { id: "a1", songId: "s1" }, files: [] });
    await (controller as any).delete("a1", {}, {});
    expect(remove).not.toHaveBeenCalled();
    expect(repos.file.deleteForContent).not.toHaveBeenCalled();
  });
});

describe("ArrangementController.getMissingFreeShowArrangements", () => {
  const post = (controller: any, freeShowIds: any) => controller.getMissingFreeShowArrangements({ body: { freeShowIds } }, {});

  it("returns the requested ids the church does not have, in request order with duplicates kept", async () => {
    const { controller } = makeController({ freeShowIds: ["b", "d"] });
    const result = await post(controller, ["c", "b", "a", "c", "d"]);
    // A bare array passes through json() with no status.
    expect(result.obj).toEqual(["c", "a", "c"]);
  });

  it("reads only the freeShow ids, once, and never loads every arrangement with its lyrics", async () => {
    const { controller, repos } = makeController({ freeShowIds: ["b"] });
    await post(controller, ["a", "b"]);
    expect(repos.arrangement.loadFreeShowIds).toHaveBeenCalledTimes(1);
    expect(repos.arrangement.loadFreeShowIds).toHaveBeenCalledWith("c1");
    expect(repos.arrangement.loadAll).not.toHaveBeenCalled();
  });

  it("still answers 401 without content edit and 400 for a bad body", async () => {
    const denied = makeController({ checkAccess: false });
    expect((await post(denied.controller, ["a"])).status).toBe(401);
    expect(denied.repos.arrangement.loadFreeShowIds).not.toHaveBeenCalled();
    const { controller } = makeController();
    expect((await post(controller, "a")).status).toBe(400);
  });
});
