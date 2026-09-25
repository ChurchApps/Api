import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Environment: { contentApi: "https://api.test/content" }, Permissions: { content: { edit: "contentEdit" } } }));
jest.mock("../../helpers/StorageResolver", () => ({ StorageResolver: { forFile: jest.fn(), forChurch: jest.fn(), forUrl: jest.fn(), publicUrl: jest.fn(), keyFromUrl: jest.fn((u: string) => (u || "").split("?")[0]) } }));
jest.mock("../../helpers/ByosAuth", () => ({ BYOS_PROVIDERS: ["googledrive", "dropbox", "onedrive"] }));
jest.mock("../../helpers/MinistryStuffStorageProvider", () => ({ QuotaExceededError: class QuotaExceededError extends Error {} }));
// apihelper ships untransformed ESM; stub the symbols FileController uses.
jest.mock("@churchapps/apihelper", () => ({
  __esModule: true,
  EnvironmentBase: { fileStore: "disk", s3Bucket: "bucket" },
  inferContentTypeFromKey: jest.fn(() => "application/octet-stream"),
  resolveMaxUploadBytes: jest.fn((n: number) => n)
}));
jest.mock("@aws-sdk/s3-presigned-post", () => ({ createPresignedPost: jest.fn() }));
jest.mock("@aws-sdk/client-s3", () => ({ S3Client: class {} }));

import { FileController } from "../FileController.js";
import { StorageResolver } from "../../helpers/StorageResolver.js";

function makeController(opts: any = {}) {
  const repos = {
    file: {
      loadById: jest.fn(async () => opts.file ?? null),
      loadTotalBytes: jest.fn(async () => ({ size: opts.totalBytes ?? 0 })),
      save: jest.fn(async (f: any) => f)
    },
    storageProvider: {}
  };
  const au = opts.au ?? { churchId: "c1", checkAccess: () => opts.checkAccess ?? true, groupIds: [] };
  const controller = new FileController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).authUser = () => ("au" in opts ? opts.au : null);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos, au };
}

function resSpy() {
  return { set: jest.fn(), redirect: jest.fn() };
}

beforeEach(() => {
  (FileController as any).mintedUrlCache = new Map();
  (StorageResolver.forFile as jest.Mock).mockReset();
});

describe("FileController.download", () => {
  it("returns 404 when the file is missing", async () => {
    const { controller, repos } = makeController();
    const res = resSpy();
    const result: any = await (controller as any).download("missing", {}, res);
    expect(result.status).toBe(404);
    expect(repos.file.loadById).toHaveBeenCalledWith("missing");
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("rejects anonymous download of a private file", async () => {
    const { controller } = makeController({ file: { id: "f1", churchId: "c1", contentType: "group", contentPath: "https://drive.example/x" } });
    const res = resSpy();
    const result: any = await (controller as any).download("f1", {}, res);
    expect(result.status).toBe(401);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(StorageResolver.forFile).not.toHaveBeenCalled();
  });

  it("rejects cross-church download of a private file", async () => {
    const { controller } = makeController({
      file: { id: "f1", churchId: "c1", contentType: "group", provider: "googledrive", externalId: "ext1" },
      au: { churchId: "other" }
    });
    const res = resSpy();
    const result: any = await (controller as any).download("f1", {}, res);
    expect(result.status).toBe(401);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(StorageResolver.forFile).not.toHaveBeenCalled();
  });

  it("lets same-church auth download a private file", async () => {
    const { controller } = makeController({
      file: { id: "f1", churchId: "c1", contentType: "group", contentPath: "https://files.test/private.pdf" },
      au: { churchId: "c1" }
    });
    const res = resSpy();
    await (controller as any).download("f1", {}, res);
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.redirect).toHaveBeenCalledWith(302, "https://files.test/private.pdf");
  });

  it("mints a provider URL for same-church auth on a private BYOS file", async () => {
    (StorageResolver.forFile as jest.Mock).mockResolvedValue({ provider: { getDownloadUrl: jest.fn(async () => "https://drive.example/minted") } });
    const { controller } = makeController({
      file: { id: "f1", churchId: "c1", contentType: "groupLeader", provider: "googledrive", externalId: "ext1" },
      au: { churchId: "c1" }
    });
    const res = resSpy();
    await (controller as any).download("f1", {}, res);
    expect(StorageResolver.forFile).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, "https://drive.example/minted");
  });

  it("allows anonymous download of a website file", async () => {
    const { controller } = makeController({ file: { id: "w1", churchId: "c1", contentType: "website", contentPath: "https://cdn.test/logo.png" } });
    const res = resSpy();
    await (controller as any).download("w1", {}, res);
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "public, max-age=300");
    expect(res.redirect).toHaveBeenCalledWith(302, "https://cdn.test/logo.png");
  });

  it("mints a provider URL for an anonymous website file", async () => {
    (StorageResolver.forFile as jest.Mock).mockResolvedValue({ provider: { getDownloadUrl: jest.fn(async () => "https://drive.example/public") } });
    const { controller } = makeController({ file: { id: "w1", churchId: "c1", contentType: "website", provider: "dropbox", externalId: "ext1" } });
    const res = resSpy();
    await (controller as any).download("w1", {}, res);
    expect(res.redirect).toHaveBeenCalledWith(302, "https://drive.example/public");
  });
});

function makeWriteController() {
  const repos = {
    file: { loadTotalBytes: jest.fn(async () => ({ size: 0 })), save: jest.fn(async (f: any) => f), load: jest.fn(), delete: jest.fn() },
    storageProvider: {}
  };
  const controller = new FileController();
  (controller as any).repos = repos;
  const au = { churchId: "c1", checkAccess: () => true, groupIds: [] };
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("FileController arrangement audio guards", () => {
  beforeEach(() => {
    (StorageResolver.forChurch as jest.Mock).mockReset();
  });

  it("rejects WAV on save", async () => {
    const { controller } = makeWriteController();
    const result: any = await (controller as any).save({ body: [{ contentType: "arrangement", contentId: "a1", fileType: "audio/wav", size: 1000, fileName: "click.wav" }] }, {});
    expect(result).toEqual({ obj: { error: "unsupported_audio_format" }, status: 400 });
    expect(StorageResolver.forChurch).not.toHaveBeenCalled();
  });

  it("rejects an oversized arrangement file on save", async () => {
    const { controller } = makeWriteController();
    const result: any = await (controller as any).save({ body: [{ contentType: "arrangement", contentId: "a1", fileType: "audio/mpeg", size: 26214401, fileName: "mix.mp3" }] }, {});
    expect(result).toEqual({ obj: { error: "file_too_large" }, status: 400 });
    expect(StorageResolver.forChurch).not.toHaveBeenCalled();
  });

  it("rejects WAV on getUploadUrl", async () => {
    const { controller } = makeWriteController();
    const result: any = await (controller as any).getUploadUrl({ body: { contentType: "arrangement", contentId: "a1", fileName: "click.wav", mimeType: "audio/wav", size: 1000 } }, {});
    expect(result).toEqual({ obj: { error: "unsupported_audio_format" }, status: 400 });
    expect(StorageResolver.forChurch).not.toHaveBeenCalled();
  });

  it("rejects an oversized arrangement file on getUploadUrl", async () => {
    const { controller } = makeWriteController();
    const result: any = await (controller as any).getUploadUrl({ body: { contentType: "arrangement", contentId: "a1", fileName: "mix.mp3", mimeType: "audio/mpeg", size: 26214401 } }, {});
    expect(result).toEqual({ obj: { error: "file_too_large" }, status: 400 });
    expect(StorageResolver.forChurch).not.toHaveBeenCalled();
  });

  it("caps omitted arrangement size at 25MB when minting a presign", async () => {
    const getUploadUrl = jest.fn(async () => ({ url: "https://s3.example/post" }));
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { getUploadUrl } });
    const { controller, repos } = makeWriteController();
    await (controller as any).getUploadUrl({ body: { contentType: "arrangement", contentId: "a1", fileName: "mix.mp3", mimeType: "audio/mpeg" } }, {});
    expect(repos.file.loadTotalBytes).toHaveBeenCalledWith("c1", "arrangement", "a1");
    expect(getUploadUrl).toHaveBeenCalledWith("/c1/files/arrangement/a1/mix.mp3", "audio/mpeg", 26214400);
  });

  it("does not apply arrangement MIME rules to website files", async () => {
    const getUploadUrl = jest.fn(async () => ({ url: "https://s3.example/post" }));
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { getUploadUrl } });
    const { controller } = makeWriteController();
    const result: any = await (controller as any).getUploadUrl({ body: { contentType: "website", contentId: "", fileName: "chart.pdf", mimeType: "application/pdf", size: 1000 } }, {});
    expect(result?.status).not.toBe(400);
    expect(getUploadUrl).toHaveBeenCalled();
  });
});

describe("FileController.save group-member authorization", () => {
  const groupAu = { churchId: "c1", checkAccess: () => false, groupIds: ["g1"] };

  it("rejects when any file in the batch targets a group the caller is not in", async () => {
    const { controller, repos } = makeController({ au: groupAu });
    const result: any = await (controller as any).save({ body: [{ contentType: "group", contentId: "g1" }, { contentType: "group", contentId: "g2" }] }, {});
    expect(result.status).toBe(401);
    expect(repos.file.save).not.toHaveBeenCalled();
  });

  it("rejects re-pointing an existing file that belongs to another group", async () => {
    const { controller, repos } = makeController({ au: groupAu });
    (repos.file as any).load = jest.fn(async () => ({ id: "f9", churchId: "c1", contentType: "group", contentId: "g2" }));
    const result: any = await (controller as any).save({ body: [{ id: "f9", contentType: "group", contentId: "g1" }] }, {});
    expect(result.status).toBe(401);
    expect(repos.file.save).not.toHaveBeenCalled();
  });
});

describe("FileController group-member upload hardening", () => {
  const groupAu = { churchId: "c1", checkAccess: () => false, groupIds: ["g1"] };

  it("rejects group members presigning outside the group content type", async () => {
    const { controller } = makeController({ au: groupAu });
    const result: any = await (controller as any).getUploadUrl({ body: { contentType: "website", contentId: "g1", fileName: "x.pdf", mimeType: "application/pdf" } }, {});
    expect(result.status).toBe(401);
  });

  it("downgrades active MIME types for group members", async () => {
    const getUploadUrl = jest.fn(async () => ({ url: "https://s3.example/post" }));
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { getUploadUrl } });
    const { controller } = makeController({ au: groupAu });
    await (controller as any).getUploadUrl({ body: { contentType: "group", contentId: "g1", fileName: "x.html", mimeType: "text/html", size: 10 } }, {});
    expect(getUploadUrl).toHaveBeenCalledWith("/c1/files/group/g1/x.html", "application/octet-stream", 10);
  });

  it("records the decoded size of inline uploads", async () => {
    const store = jest.fn(async () => "k");
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { store } });
    (StorageResolver.publicUrl as jest.Mock).mockReturnValue("https://cdn.test/x");
    const { controller, repos } = makeController({ au: groupAu });
    await (controller as any).save({ body: [{ contentType: "group", contentId: "g1", fileName: "a.txt", fileType: "image/svg+xml", size: 1, fileContents: "data:text/plain;base64,QUJDRA==" }] }, {});
    expect(repos.file.save).toHaveBeenCalledWith(expect.objectContaining({ size: 4, fileType: "application/octet-stream" }));
  });
});
