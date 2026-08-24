import "reflect-metadata";
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../shared/helpers/index", () => ({ Permissions: { server: { admin: { contentType: "Server", action: "Admin" } } } }));
jest.mock("../helpers/index", () => ({
  ContentLibraryHelper: {
    publishSong: jest.fn(async () => ({ path: "commons/songs/en/wc-license/hymn--song0000001" })),
    removeSongObjects: jest.fn(async () => {}),
    publishAsset: jest.fn(async () => ({ path: "commons/assets/freeshow/template/asset000001" })),
    removeAssetObjects: jest.fn(async () => {})
  },
  QualityHelper: { score: jest.fn(async () => ({})) }
}));

import { CommonsAdminController } from "../controllers/CommonsAdminController.js";
import { ContentLibraryHelper } from "../helpers/index.js";

function adminController(asset: any, song?: any) {
  const repos: any = {
    asset: { loadById: jest.fn(async () => asset), update: jest.fn(async () => {}) },
    song: { loadById: jest.fn(async () => song), update: jest.fn(async () => {}) }
  };
  const au = { id: "admin000001", checkAccess: () => true };
  const controller = new CommonsAdminController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

const req = { params: { id: "song0000001" } } as any;

describe("unified asset approval", () => {
  beforeEach(() => jest.clearAllMocks());

  it("runs the song publish hook and stores the published path on the asset", async () => {
    const song = { id: "song0000001", title: "Hymn", status: "pending", path: "commons/pending/song0000001", files: "demoAudio.wav" };
    const { controller, repos } = adminController({ id: "song0000001", assetType: "song" }, song);
    const result: any = await controller.approve(req, {} as any);

    expect(ContentLibraryHelper.publishSong).toHaveBeenCalled();
    expect(ContentLibraryHelper.publishAsset).not.toHaveBeenCalled();
    expect(repos.song.update).not.toHaveBeenCalled();
    expect(repos.asset.update).toHaveBeenCalledWith("song0000001", expect.objectContaining({ path: "commons/songs/en/wc-license/hymn--song0000001", status: "approved", reviewedBy: "admin000001" }));
    expect(result).toEqual({ status: "approved" });
  });

  it("promotes generic assets without touching the song helpers", async () => {
    const { controller, repos } = adminController({ id: "asset000001", assetType: "freeshow/template" });
    await controller.approveAsset({ params: { id: "asset000001" } } as any, {} as any);

    expect(ContentLibraryHelper.publishAsset).toHaveBeenCalled();
    expect(ContentLibraryHelper.publishSong).not.toHaveBeenCalled();
    expect(repos.asset.update).toHaveBeenCalledWith("asset000001", expect.objectContaining({ path: "commons/assets/freeshow/template/asset000001", status: "approved" }));
  });

  it("removes stored song objects and clears path/files on reject", async () => {
    const song = { id: "song0000001", title: "Hymn", status: "pending", path: "commons/pending/song0000001" };
    const { controller, repos } = adminController({ id: "song0000001", assetType: "song" }, song);
    await controller.reject(req, {} as any);

    expect(ContentLibraryHelper.removeSongObjects).toHaveBeenCalledWith(song);
    expect(ContentLibraryHelper.removeAssetObjects).not.toHaveBeenCalled();
    expect(repos.asset.update).toHaveBeenCalledWith("song0000001", expect.objectContaining({ path: null, files: null, status: "removed" }));
  });

  it("clears stored paths when a generic asset is rejected", async () => {
    const { controller, repos } = adminController({ id: "asset000001", assetType: "freeshow/template" });
    await controller.rejectAsset({ params: { id: "asset000001" } } as any, {} as any);

    expect(ContentLibraryHelper.removeAssetObjects).toHaveBeenCalled();
    expect(repos.asset.update).toHaveBeenCalledWith("asset000001", expect.objectContaining({ path: null, files: null, status: "removed" }));
  });

  it("404s an unknown id", async () => {
    const { controller, repos } = adminController(undefined);
    const result: any = await controller.approve(req, {} as any);
    expect(result.status).toBe(404);
    expect(repos.asset.update).not.toHaveBeenCalled();
  });
});
