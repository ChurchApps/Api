import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Environment: { fileStore: "S3" }, Permissions: { content: { edit: "contentEdit" } } }));
// apihelper ships untransformed ESM; stub the symbols GalleryController uses.
jest.mock("@churchapps/apihelper", () => ({
  __esModule: true,
  AwsHelper: { S3PresignedUrl: jest.fn(async (key: string) => ({ key, url: "https://s3.test/upload" })) },
  FileStorageHelper: { list: jest.fn(async () => ["c1/gallery/0/1.jpg"]), remove: jest.fn(async () => {}) }
}));

import { GalleryController } from "../GalleryController.js";
import { AwsHelper, FileStorageHelper } from "@churchapps/apihelper";

function makeController(opts: any = {}) {
  const au = {
    churchId: "c1",
    groupIds: opts.groupIds ?? [],
    leaderGroupIds: opts.leaderGroupIds ?? [],
    checkAccess: (perm: string) => (opts.access ?? []).includes(perm)
  };
  const controller = new GalleryController();
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, au };
}

beforeEach(() => {
  (AwsHelper.S3PresignedUrl as jest.Mock).mockClear();
  (FileStorageHelper.list as jest.Mock).mockClear();
  (FileStorageHelper.remove as jest.Mock).mockClear();
});

describe("GalleryController.getUploadUrl", () => {
  it("issues a presigned url for a content admin", async () => {
    const { controller } = makeController({ access: ["contentEdit"] });
    const result: any = await controller.getUploadUrl({ body: { folder: "0", fileName: "1.jpg" } } as any, {} as any);
    expect(result.key).toBe("c1/gallery/0/1.jpg");
  });

  // A group leader can already create and edit their group's calendar events (EventController.save
  // allows leaderGroupIds), so the "Insert Image" button in the event description editor must work
  // for them too instead of 401ing into a misleading "API may not be available" alert.
  it("issues a presigned url for a group leader without content.edit", async () => {
    const { controller } = makeController({ leaderGroupIds: ["g1"] });
    const result: any = await controller.getUploadUrl({ body: { folder: "0", fileName: "1.jpg" } } as any, {} as any);
    expect(result.status).not.toBe(401);
    expect(result.key).toBe("c1/gallery/0/1.jpg");
  });

  it("rejects a plain member who leads no groups", async () => {
    const { controller } = makeController({ groupIds: ["g1"] });
    const result: any = await controller.getUploadUrl({ body: { folder: "0", fileName: "1.jpg" } } as any, {} as any);
    expect(result.status).toBe(401);
    expect(AwsHelper.S3PresignedUrl).not.toHaveBeenCalled();
  });
});

describe("GalleryController.getAll", () => {
  it("lists gallery images for a group leader without content.edit", async () => {
    const { controller } = makeController({ leaderGroupIds: ["g1"] });
    const result: any = await controller.getAll("0", {} as any, {} as any);
    expect(result.status).not.toBe(401);
    expect(result.images).toEqual(["c1/gallery/0/1.jpg"]);
  });

  it("rejects a plain member who leads no groups", async () => {
    const { controller } = makeController({});
    const result: any = await controller.getAll("0", {} as any, {} as any);
    expect(result.status).toBe(401);
  });
});

describe("GalleryController.delete", () => {
  // Deleting from the shared church gallery stays admin-only - a leader uploading for their own
  // event should not be able to remove a website admin's images.
  it("rejects a group leader without content.edit", async () => {
    const { controller } = makeController({ leaderGroupIds: ["g1"] });
    const result: any = await controller.delete("0", "1.jpg", {} as any, {} as any);
    expect(result.status).toBe(401);
    expect(FileStorageHelper.remove).not.toHaveBeenCalled();
  });

  it("allows a content admin", async () => {
    const { controller } = makeController({ access: ["contentEdit"] });
    await controller.delete("0", "1.jpg", {} as any, {} as any);
    expect(FileStorageHelper.remove).toHaveBeenCalledWith("c1/gallery/0/1.jpg");
  });
});
