import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
const mockEnvironment = { fileStore: "S3" };
jest.mock("../../helpers/index", () => ({ Environment: mockEnvironment, Permissions: { content: { edit: "contentEdit" } } }));
// apihelper ships untransformed ESM; stub the symbols GalleryController uses.
jest.mock("@churchapps/apihelper", () => ({
  __esModule: true,
  AwsHelper: { S3PresignedUrl: jest.fn(async (key: string) => ({ key, url: "https://s3.test/upload" })) },
  FileStorageHelper: { list: jest.fn(async () => ["c1/gallery/0/1.jpg"]), remove: jest.fn(async () => {}), store: jest.fn(async () => {}) }
}));

import { GalleryController } from "../GalleryController.js";
import { AwsHelper, FileStorageHelper } from "@churchapps/apihelper";

// Either a successful payload (key / images) or the json(obj, status) stub's error shape.
type GalleryResult = { key?: string; images?: string[]; obj?: unknown; status?: number };

interface ControllerOpts {
  groupIds?: string[];
  leaderGroupIds?: string[];
  access?: string[];
}

function makeController(opts: ControllerOpts = {}) {
  const au = {
    churchId: "c1",
    groupIds: opts.groupIds ?? [],
    leaderGroupIds: opts.leaderGroupIds ?? [],
    checkAccess: (perm: string) => (opts.access ?? []).includes(perm)
  };
  const controller = new GalleryController();
  Object.assign(controller, {
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action(),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, au };
}

beforeEach(() => {
  mockEnvironment.fileStore = "S3";
  (FileStorageHelper.store as jest.Mock).mockClear();
  (AwsHelper.S3PresignedUrl as jest.Mock).mockClear();
  (FileStorageHelper.list as jest.Mock).mockClear();
  (FileStorageHelper.remove as jest.Mock).mockClear();
});

describe("GalleryController.getUploadUrl", () => {
  it("issues a presigned url for a content admin", async () => {
    const { controller } = makeController({ access: ["contentEdit"] });
    const result = (await controller.getUploadUrl({ body: { folder: "0", fileName: "1.jpg" } } as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.key).toBe("c1/gallery/0/1.jpg");
  });

  // A group leader can already create and edit their group's calendar events (EventController.save
  // allows leaderGroupIds), so the "Insert Image" button in the event description editor must work
  // for them too instead of 401ing into a misleading "API may not be available" alert.
  it("issues a presigned url for a group leader without content.edit", async () => {
    const { controller } = makeController({ leaderGroupIds: ["g1"] });
    const result = (await controller.getUploadUrl({ body: { folder: "0", fileName: "1.jpg" } } as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.status).not.toBe(401);
    expect(result.key).toMatch(/^c1\/gallery\/0\/1-[0-9a-f]{12}\.jpg$/);
  });

  it("rejects non-image uploads from a group leader", async () => {
    const { controller } = makeController({ leaderGroupIds: ["g1"] });
    const result = (await controller.getUploadUrl({ body: { folder: "0", fileName: "x.html" } } as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.status).toBe(400);
  });

  it("rejects a plain member who leads no groups", async () => {
    const { controller } = makeController({ groupIds: ["g1"] });
    const result = (await controller.getUploadUrl({ body: { folder: "0", fileName: "1.jpg" } } as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.status).toBe(401);
    expect(AwsHelper.S3PresignedUrl).not.toHaveBeenCalled();
  });
});

describe("GalleryController.getAll", () => {
  it("lists gallery images for a group leader without content.edit", async () => {
    const { controller } = makeController({ leaderGroupIds: ["g1"] });
    const result = (await controller.getAll("0", {} as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.status).not.toBe(401);
    expect(result.images).toEqual(["c1/gallery/0/1.jpg"]);
  });

  // The disk store lists bare file names where S3 lists full keys; the dialog builds image urls from full keys.
  it("returns full keys when the disk store lists bare file names", async () => {
    (FileStorageHelper.list as jest.Mock).mockResolvedValueOnce(["1.png"]);
    const { controller } = makeController({ access: ["contentEdit"] });
    const result = (await controller.getAll("1.78", {} as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.images).toEqual(["c1/gallery/1.78/1.png"]);
  });

  it("rejects a plain member who leads no groups", async () => {
    const { controller } = makeController({});
    const result = (await controller.getAll("0", {} as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.status).toBe(401);
  });
});

describe("GalleryController.delete", () => {
  // Deleting from the shared church gallery stays admin-only - a leader uploading for their own
  // event should not be able to remove a website admin's images.
  it("rejects a group leader without content.edit", async () => {
    const { controller } = makeController({ leaderGroupIds: ["g1"] });
    const result = (await controller.delete("0", "1.jpg", {} as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.status).toBe(401);
    expect(FileStorageHelper.remove).not.toHaveBeenCalled();
  });

  it("allows a content admin", async () => {
    const { controller } = makeController({ access: ["contentEdit"] });
    await controller.delete("0", "1.jpg", {} as express.Request, {} as express.Response);
    expect(FileStorageHelper.remove).toHaveBeenCalledWith("c1/gallery/0/1.jpg");
  });
});

// Self-hosted installs store files on disk, where there is no presigned S3 slot to hand back, so the
// gallery dialog posts the image itself.
describe("GalleryController.upload", () => {
  const png = "data:image/png;base64," + Buffer.from("png-bytes").toString("base64");

  it("stores the image on disk for a content admin", async () => {
    mockEnvironment.fileStore = "disk";
    const { controller } = makeController({ access: ["contentEdit"] });
    const result = (await controller.upload({ body: { folder: "1.78", fileName: "1.png", contentType: "image/png", fileContents: png } } as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.key).toBe("c1/gallery/1.78/1.png");
    expect(FileStorageHelper.store).toHaveBeenCalledWith("c1/gallery/1.78/1.png", "image/png", Buffer.from("png-bytes"));
  });

  it("gives a group leader an unguessable name", async () => {
    mockEnvironment.fileStore = "disk";
    const { controller } = makeController({ leaderGroupIds: ["g1"] });
    const result = (await controller.upload({ body: { folder: "1.78", fileName: "1.png", contentType: "image/png", fileContents: png } } as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.key).toMatch(/^c1\/gallery\/1\.78\/1-[0-9a-f]{12}\.png$/);
  });

  it("rejects non-image uploads from a group leader", async () => {
    mockEnvironment.fileStore = "disk";
    const { controller } = makeController({ leaderGroupIds: ["g1"] });
    const result = (await controller.upload({ body: { folder: "1.78", fileName: "x.svg", contentType: "image/svg+xml", fileContents: png } } as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.status).toBe(400);
    expect(FileStorageHelper.store).not.toHaveBeenCalled();
  });

  it("rejects an image over 25 MB, like file uploads", async () => {
    mockEnvironment.fileStore = "disk";
    const { controller } = makeController({ access: ["contentEdit"] });
    const big = "data:image/png;base64," + Buffer.alloc(26 * 1024 * 1024).toString("base64");
    const result = (await controller.upload({ body: { folder: "1.78", fileName: "1.png", contentType: "image/png", fileContents: big } } as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.status).toBe(400);
    expect(FileStorageHelper.store).not.toHaveBeenCalled();
  });

  it("rejects a plain member who leads no groups", async () => {
    mockEnvironment.fileStore = "disk";
    const { controller } = makeController({ groupIds: ["g1"] });
    const result = (await controller.upload({ body: { folder: "1.78", fileName: "1.png", contentType: "image/png", fileContents: png } } as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.status).toBe(401);
  });

  it("is not used when files live in S3", async () => {
    const { controller } = makeController({ access: ["contentEdit"] });
    const result = (await controller.upload({ body: { folder: "1.78", fileName: "1.png", contentType: "image/png", fileContents: png } } as express.Request, {} as express.Response)) as GalleryResult;
    expect(result.status).toBe(400);
    expect(FileStorageHelper.store).not.toHaveBeenCalled();
  });
});
