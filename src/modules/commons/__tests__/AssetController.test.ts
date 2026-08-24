import "reflect-metadata";
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../helpers/index", () => {
  const { assetSubmitError } = jest.requireActual("../helpers/SubmitValidation");
  return {
    assetSubmitError,
    ContentLibraryHelper: {
      assetPendingFolderKey: (id: string) => `commons/pending/assets/${id}`,
      storePending: jest.fn(async () => {}),
      publicUrl: (k: string) => `http://localhost:8084/content/${k}`,
      withUrls: (v: any) => v
    }
  };
});

import { CommonsAssetController } from "../controllers/CommonsAssetController.js";

const ONE_MB = "A".repeat(1398100); // ~1MB once base64-decoded

function assetController(opts: any = {}) {
  const repos: any = {
    asset: {
      loadByHash: jest.fn(async () => opts.existingByHash ?? undefined),
      create: jest.fn(async (a: any) => { a.id = "asset000001"; return a; }),
      update: jest.fn(async () => {})
    }
  };
  const au = { id: opts.userId ?? "user0000001", churchId: opts.churchId ?? "church00001", checkAccess: () => false };
  const controller = new CommonsAssetController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos, au };
}

function body(overrides: any = {}) {
  return {
    assetType: "freeshow/template",
    name: "Advent Slides",
    license: "CC0",
    file: { name: "slides.zip", contentType: "application/zip", base64: Buffer.from("hello").toString("base64") },
    ...overrides
  };
}

describe("AssetController.submit validation", () => {
  it("stores a valid submission as pending owned by the caller", async () => {
    const { controller, repos } = assetController();
    const result: any = await controller.submit({ body: body() } as any, {} as any);
    expect(result.status).toBe("pending");
    expect(result.publisherUserId).toBe("user0000001");
    expect(result.path).toBe("commons/pending/assets/asset000001");
    expect(result.files).toBe("content.zip");
    expect(result.sizeBytes).toBeUndefined();
    expect(repos.asset.create).toHaveBeenCalled();
  });

  it("rejects an unrecognized license", async () => {
    const { controller, repos } = assetController();
    const result: any = await controller.submit({ body: body({ license: "GPL" }) } as any, {} as any);
    expect(result.status).toBe(400);
    expect(result.obj.errors[0]).toMatch(/license/);
    expect(repos.asset.create).not.toHaveBeenCalled();
  });

  it("rejects a payload over the 25MB cap", async () => {
    const { controller, repos } = assetController();
    const oversized = { name: "big.zip", contentType: "application/zip", base64: ONE_MB.repeat(26) };
    const result: any = await controller.submit({ body: body({ file: oversized }) } as any, {} as any);
    expect(result.status).toBe(400);
    expect(result.obj.errors[0]).toMatch(/25MB/);
    expect(repos.asset.create).not.toHaveBeenCalled();
  });

  it("refuses a duplicate contentHash with a 409", async () => {
    const { controller, repos } = assetController({ existingByHash: { id: "existing001", status: "approved" } });
    const result: any = await controller.submit({ body: body() } as any, {} as any);
    expect(result.status).toBe(409);
    expect(repos.asset.loadByHash).toHaveBeenCalled();
    expect(repos.asset.create).not.toHaveBeenCalled();
  });
});
