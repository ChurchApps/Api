import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
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
jest.mock("../../helpers/GoogleDriveStorageProvider", () => ({
  GoogleDriveStorageProvider: class {
    getUploadUrl = jest.fn(async () => ({ url: "create" }));
    getReplaceUploadUrl = jest.fn(async () => ({ url: "replace" }));
    getKeyedFileInfo = jest.fn(async (): Promise<{ url: string; md5: string | null; modified: string | null; size: number | null } | null> => null);
  }
}));
jest.mock("@aws-sdk/s3-presigned-post", () => ({ createPresignedPost: jest.fn() }));
jest.mock("@aws-sdk/client-s3", () => ({ S3Client: class {} }));

import { FileController } from "../FileController.js";
import { StorageResolver } from "../../helpers/StorageResolver.js";
import { GoogleDriveStorageProvider } from "../../helpers/GoogleDriveStorageProvider.js";
import { File, StorageProvider } from "../../models/index.js";
import { StorageProviderRepo } from "../../repositories/index.js";

type JsonResult = { obj: unknown; status: number };

interface TestAu {
  churchId: string;
  checkAccess?: () => boolean;
  groupIds?: string[];
}

interface ControllerOpts {
  file?: File;
  totalBytes?: number;
  au?: TestAu;
  checkAccess?: boolean;
}

function makeController(opts: ControllerOpts = {}) {
  const repos = {
    file: {
      loadById: jest.fn(async () => opts.file ?? null),
      loadTotalBytes: jest.fn(async () => ({ size: opts.totalBytes ?? 0 })),
      save: jest.fn(async (f: File) => f)
    },
    storageProvider: {}
  };
  const au: TestAu = opts.au ?? { churchId: "c1", checkAccess: () => opts.checkAccess ?? true, groupIds: [] };
  const controller = new FileController();
  Object.assign(controller, {
    repos,
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action(),
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: TestAu) => unknown) => action(au),
    authUser: () => ("au" in opts ? opts.au : null),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos, au };
}

function resSpy() {
  return { set: jest.fn(), redirect: jest.fn() } as Partial<express.Response>;
}

beforeEach(() => {
  FileController["mintedUrlCache"] = new Map();
  (StorageResolver.forFile as jest.Mock).mockReset();
});

describe("FileController.download", () => {
  it("returns 404 when the file is missing", async () => {
    const { controller, repos } = makeController();
    const res = resSpy();
    const result = await controller.download("missing", {} as express.Request, res as express.Response);
    expect((result as JsonResult).status).toBe(404);
    expect(repos.file.loadById).toHaveBeenCalledWith("missing");
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("rejects anonymous download of a private file", async () => {
    const { controller } = makeController({ file: { id: "f1", churchId: "c1", contentType: "group", contentPath: "https://drive.example/x" } });
    const res = resSpy();
    const result = await controller.download("f1", {} as express.Request, res as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(StorageResolver.forFile).not.toHaveBeenCalled();
  });

  it("rejects cross-church download of a private file", async () => {
    const { controller } = makeController({
      file: { id: "f1", churchId: "c1", contentType: "group", provider: "googledrive", externalId: "ext1" },
      au: { churchId: "other" }
    });
    const res = resSpy();
    const result = await controller.download("f1", {} as express.Request, res as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(StorageResolver.forFile).not.toHaveBeenCalled();
  });

  it("lets same-church auth download a private file", async () => {
    const { controller } = makeController({
      file: { id: "f1", churchId: "c1", contentType: "group", contentPath: "https://files.test/private.pdf" },
      au: { churchId: "c1" }
    });
    const res = resSpy();
    await controller.download("f1", {} as express.Request, res as express.Response);
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
    await controller.download("f1", {} as express.Request, res as express.Response);
    expect(StorageResolver.forFile).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, "https://drive.example/minted");
  });

  it("allows anonymous download of a website file", async () => {
    const { controller } = makeController({ file: { id: "w1", churchId: "c1", contentType: "website", contentPath: "https://cdn.test/logo.png" } });
    const res = resSpy();
    await controller.download("w1", {} as express.Request, res as express.Response);
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "public, max-age=300");
    expect(res.redirect).toHaveBeenCalledWith(302, "https://cdn.test/logo.png");
  });

  it("mints a provider URL for an anonymous website file", async () => {
    (StorageResolver.forFile as jest.Mock).mockResolvedValue({ provider: { getDownloadUrl: jest.fn(async () => "https://drive.example/public") } });
    const { controller } = makeController({ file: { id: "w1", churchId: "c1", contentType: "website", provider: "dropbox", externalId: "ext1" } });
    const res = resSpy();
    await controller.download("w1", {} as express.Request, res as express.Response);
    expect(res.redirect).toHaveBeenCalledWith(302, "https://drive.example/public");
  });
});

function makeWriteController() {
  const repos = {
    file: { loadTotalBytes: jest.fn(async () => ({ size: 0 })), save: jest.fn(async (f: File) => f), load: jest.fn(), delete: jest.fn() },
    storageProvider: {}
  };
  const controller = new FileController();
  const au: TestAu = { churchId: "c1", checkAccess: () => true, groupIds: [] };
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: TestAu) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("FileController arrangement audio guards", () => {
  beforeEach(() => {
    (StorageResolver.forChurch as jest.Mock).mockReset();
  });

  it("rejects WAV on save", async () => {
    const { controller } = makeWriteController();
    const result = await controller.save({ body: [{ contentType: "arrangement", contentId: "a1", fileType: "audio/wav", size: 1000, fileName: "click.wav" }] } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "unsupported_audio_format" }, status: 400 });
    expect(StorageResolver.forChurch).not.toHaveBeenCalled();
  });

  it("rejects an oversized arrangement file on save", async () => {
    const { controller } = makeWriteController();
    const result = await controller.save({ body: [{ contentType: "arrangement", contentId: "a1", fileType: "audio/mpeg", size: 26214401, fileName: "mix.mp3" }] } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "file_too_large" }, status: 400 });
    expect(StorageResolver.forChurch).not.toHaveBeenCalled();
  });

  it("rejects WAV on getUploadUrl", async () => {
    const { controller } = makeWriteController();
    const result = await controller.getUploadUrl({ body: { contentType: "arrangement", contentId: "a1", fileName: "click.wav", mimeType: "audio/wav", size: 1000 } } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "unsupported_audio_format" }, status: 400 });
    expect(StorageResolver.forChurch).not.toHaveBeenCalled();
  });

  it("rejects an oversized arrangement file on getUploadUrl", async () => {
    const { controller } = makeWriteController();
    const result = await controller.getUploadUrl({ body: { contentType: "arrangement", contentId: "a1", fileName: "mix.mp3", mimeType: "audio/mpeg", size: 26214401 } } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "file_too_large" }, status: 400 });
    expect(StorageResolver.forChurch).not.toHaveBeenCalled();
  });

  it("caps omitted arrangement size at 25MB when minting a presign", async () => {
    const getUploadUrl = jest.fn(async () => ({ url: "https://s3.example/post" }));
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { getUploadUrl } });
    const { controller, repos } = makeWriteController();
    await controller.getUploadUrl({ body: { contentType: "arrangement", contentId: "a1", fileName: "mix.mp3", mimeType: "audio/mpeg" } } as express.Request, {} as express.Response);
    expect(repos.file.loadTotalBytes).toHaveBeenCalledWith("c1", "arrangement", "a1");
    expect(getUploadUrl).toHaveBeenCalledWith("/c1/files/arrangement/a1/mix.mp3", "audio/mpeg", 26214400);
  });

  it("does not apply arrangement MIME rules to website files", async () => {
    const getUploadUrl = jest.fn(async () => ({ url: "https://s3.example/post" }));
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { getUploadUrl } });
    const { controller } = makeWriteController();
    const result = await controller.getUploadUrl({ body: { contentType: "website", contentId: "", fileName: "chart.pdf", mimeType: "application/pdf", size: 1000 } } as express.Request, {} as express.Response);
    expect((result as JsonResult | undefined)?.status).not.toBe(400);
    expect(getUploadUrl).toHaveBeenCalled();
  });
});

describe("FileController arrangement chart PDFs", () => {
  const pdfData = (text: string) => "data:application/pdf;base64," + Buffer.from(text).toString("base64");

  beforeEach(() => {
    (StorageResolver.forChurch as jest.Mock).mockReset();
    (StorageResolver.publicUrl as jest.Mock).mockReturnValue("https://cdn.test/chart.pdf");
  });

  it("stores a real PDF on an arrangement and counts its decoded size", async () => {
    const store = jest.fn(async () => "k");
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { store } });
    const { controller, repos } = makeWriteController();
    const contents = pdfData("%PDF-1.7\n%chart");
    await controller.save({ body: [{ contentType: "arrangement", contentId: "a1", fileType: "application/pdf", size: 1, fileName: "chart.pdf", fileContents: contents }] } as express.Request, {} as express.Response);
    expect(repos.file.loadTotalBytes).toHaveBeenCalledWith("c1", "arrangement", "a1");
    expect(store).toHaveBeenCalledWith("/c1/files/arrangement/a1/chart.pdf", "application/pdf", expect.any(Buffer));
    expect(repos.file.save).toHaveBeenCalledWith(expect.objectContaining({ fileType: "application/pdf", size: 15 }));
  });

  it("rejects a file declared as PDF whose bytes are not a PDF", async () => {
    const { controller, repos } = makeWriteController();
    const result = await controller.save({ body: [{ contentType: "arrangement", contentId: "a1", fileType: "application/pdf", size: 20, fileName: "chart.pdf", fileContents: pdfData("<html><script>x</script>") }] } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "invalid_pdf" }, status: 400 });
    expect(StorageResolver.forChurch).not.toHaveBeenCalled();
    expect(repos.file.save).not.toHaveBeenCalled();
  });

  it("rejects a PDF registered without inline bytes", async () => {
    const { controller } = makeWriteController();
    const result = await controller.save({ body: [{ contentType: "arrangement", contentId: "a1", fileType: "application/pdf", size: 20, fileName: "chart.pdf" }] } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "invalid_pdf" }, status: 400 });
  });

  it("rejects a PDF without a .pdf name", async () => {
    const { controller } = makeWriteController();
    const result = await controller.save({ body: [{ contentType: "arrangement", contentId: "a1", fileType: "application/pdf", size: 20, fileName: "chart.html", fileContents: pdfData("%PDF-1.7") }] } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "invalid_pdf" }, status: 400 });
  });

  it("rejects an oversized PDF by declared size", async () => {
    const { controller } = makeWriteController();
    const result = await controller.save({ body: [{ contentType: "arrangement", contentId: "a1", fileType: "application/pdf", size: 4194305, fileName: "chart.pdf", fileContents: pdfData("%PDF-1.7") }] } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "pdf_too_large" }, status: 400 });
  });

  it("rejects an oversized PDF by decoded size when the declared size lies", async () => {
    const { controller } = makeWriteController();
    const big = "%PDF-1.7\n" + "x".repeat(4194304);
    const result = await controller.save({ body: [{ contentType: "arrangement", contentId: "a1", fileType: "application/pdf", size: 10, fileName: "chart.pdf", fileContents: pdfData(big) }] } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "pdf_too_large" }, status: 400 });
    expect(StorageResolver.forChurch).not.toHaveBeenCalled();
  });

  it("checks every arrangement file in the batch, not only the first", async () => {
    const { controller } = makeWriteController();
    const result = await controller.save({
      body: [
        { contentType: "arrangement", contentId: "a1", fileType: "application/pdf", size: 10, fileName: "a.pdf", fileContents: pdfData("%PDF-1.7") },
        { contentType: "arrangement", contentId: "a1", fileType: "application/pdf", size: 10, fileName: "b.pdf", fileContents: pdfData("GIF89a") }
      ]
    } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "invalid_pdf" }, status: 400 });
  });

  it("declines to presign an arrangement PDF so it is sent inline", async () => {
    const getUploadUrl = jest.fn(async () => ({ url: "https://s3.example/post" }));
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { getUploadUrl } });
    const { controller } = makeWriteController();
    const result = await controller.getUploadUrl({ body: { contentType: "arrangement", contentId: "a1", fileName: "chart.pdf", mimeType: "application/pdf", size: 1000 } } as express.Request, {} as express.Response);
    expect(result).toEqual({});
    expect(getUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects an oversized PDF on getUploadUrl", async () => {
    const { controller } = makeWriteController();
    const result = await controller.getUploadUrl({ body: { contentType: "arrangement", contentId: "a1", fileName: "chart.pdf", mimeType: "application/pdf", size: 4194305 } } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "pdf_too_large" }, status: 400 });
  });

  it("still rejects other document types on an arrangement", async () => {
    const { controller } = makeWriteController();
    const result = await controller.getUploadUrl({ body: { contentType: "arrangement", contentId: "a1", fileName: "chart.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1000 } } as express.Request, {} as express.Response);
    expect(result).toEqual({ obj: { error: "unsupported_audio_format" }, status: 400 });
  });

  it("still presigns arrangement audio as before", async () => {
    const getUploadUrl = jest.fn(async () => ({ url: "https://s3.example/post" }));
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { getUploadUrl } });
    const { controller } = makeWriteController();
    await controller.getUploadUrl({ body: { contentType: "arrangement", contentId: "a1", fileName: "mix.mp3", mimeType: "audio/mpeg", size: 1000 } } as express.Request, {} as express.Response);
    expect(getUploadUrl).toHaveBeenCalledWith("/c1/files/arrangement/a1/mix.mp3", "audio/mpeg", 1000);
  });

  it("does not require PDF bytes for PDFs on other content types", async () => {
    const getUploadUrl = jest.fn(async () => ({ url: "https://s3.example/post" }));
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { getUploadUrl } });
    const { controller } = makeWriteController();
    await controller.getUploadUrl({ body: { contentType: "website", contentId: "", fileName: "bulletin.pdf", mimeType: "application/pdf", size: 1000 } } as express.Request, {} as express.Response);
    expect(getUploadUrl).toHaveBeenCalled();
  });
});

describe("FileController.save group-member authorization", () => {
  const groupAu = { churchId: "c1", checkAccess: () => false, groupIds: ["g1"] };

  it("rejects when any file in the batch targets a group the caller is not in", async () => {
    const { controller, repos } = makeController({ au: groupAu });
    const result = await controller.save({ body: [{ contentType: "group", contentId: "g1" }, { contentType: "group", contentId: "g2" }] } as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.file.save).not.toHaveBeenCalled();
  });

  it("rejects re-pointing an existing file that belongs to another group", async () => {
    const { controller, repos } = makeController({ au: groupAu });
    Object.assign(repos.file, { load: jest.fn(async (): Promise<File> => ({ id: "f9", churchId: "c1", contentType: "group", contentId: "g2" })) });
    const result = await controller.save({ body: [{ id: "f9", contentType: "group", contentId: "g1" }] } as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
    expect(repos.file.save).not.toHaveBeenCalled();
  });
});

describe("FileController group-member upload hardening", () => {
  const groupAu = { churchId: "c1", checkAccess: () => false, groupIds: ["g1"] };

  it("rejects group members presigning outside the group content type", async () => {
    const { controller } = makeController({ au: groupAu });
    const result = await controller.getUploadUrl({ body: { contentType: "website", contentId: "g1", fileName: "x.pdf", mimeType: "application/pdf" } } as express.Request, {} as express.Response);
    expect((result as JsonResult).status).toBe(401);
  });

  it("downgrades active MIME types for group members", async () => {
    const getUploadUrl = jest.fn(async () => ({ url: "https://s3.example/post" }));
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { getUploadUrl } });
    const { controller } = makeController({ au: groupAu });
    await controller.getUploadUrl({ body: { contentType: "group", contentId: "g1", fileName: "x.html", mimeType: "text/html", size: 10 } } as express.Request, {} as express.Response);
    expect(getUploadUrl).toHaveBeenCalledWith("/c1/files/group/g1/x.html", "application/octet-stream", 10);
  });

  it("records the decoded size of inline uploads", async () => {
    const store = jest.fn(async () => "k");
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: { store } });
    (StorageResolver.publicUrl as jest.Mock).mockReturnValue("https://cdn.test/x");
    const { controller, repos } = makeController({ au: groupAu });
    await controller.save({ body: [{ contentType: "group", contentId: "g1", fileName: "a.txt", fileType: "image/svg+xml", size: 1, fileContents: "data:text/plain;base64,QUJDRA==" }] } as express.Request, {} as express.Response);
    expect(repos.file.save).toHaveBeenCalledWith(expect.objectContaining({ size: 4, fileType: "application/octet-stream" }));
  });
});

describe("FileController FreeShow sync on Google Drive", () => {
  const groupAu = { churchId: "c1", checkAccess: () => false, groupIds: ["g1"] };
  const useDrive = () => {
    // The mocked class ignores its constructor args.
    const provider = jest.mocked(new GoogleDriveStorageProvider({} as StorageProvider, {} as StorageProviderRepo));
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "googledrive", provider });
    return provider;
  };

  it("presigns sync zips as a replace of the keyed Drive file", async () => {
    const provider = useDrive();
    const { controller } = makeController({ au: groupAu });
    const result = await controller.getUploadUrl({ body: { contentType: "group", contentId: "g1", fileName: "current.zip", mimeType: "application/zip", size: 10 } } as express.Request, {} as express.Response);
    expect(result).toEqual({ url: "replace" });
    expect(provider.getReplaceUploadUrl).toHaveBeenCalledWith("/c1/files/group/g1/current.zip", "application/zip", 10);
    expect(provider.getUploadUrl).not.toHaveBeenCalled();
  });

  it("still creates new Drive files for other group uploads", async () => {
    const provider = useDrive();
    const { controller } = makeController({ au: groupAu });
    await controller.getUploadUrl({ body: { contentType: "group", contentId: "g1", fileName: "notes.zip", mimeType: "application/zip", size: 10 } } as express.Request, {} as express.Response);
    expect(provider.getUploadUrl).toHaveBeenCalled();
    expect(provider.getReplaceUploadUrl).not.toHaveBeenCalled();
  });

  it("reports the Drive location and change markers of a sync zip", async () => {
    const provider = useDrive();
    provider.getKeyedFileInfo.mockResolvedValue({ url: "https://drive/x", md5: "abc", modified: "2026-11-16T00:00:00Z", size: 5 });
    const { controller } = makeController({ au: groupAu });
    const result = await controller.syncFileInfo("g1", "current.zip", {} as express.Request, {} as express.Response);
    expect(provider.getKeyedFileInfo).toHaveBeenCalledWith("/c1/files/group/g1/current.zip");
    expect(result).toEqual({ external: true, url: "https://drive/x", md5: "abc", modified: "2026-11-16T00:00:00Z", size: 5 });
  });

  it("reports external with no url before the first Drive upload", async () => {
    useDrive();
    const { controller } = makeController({ au: groupAu });
    expect(await controller.syncFileInfo("g1", "previous.zip", {} as express.Request, {} as express.Response)).toEqual({ external: true });
  });

  it("points non-Drive churches at the platform content host", async () => {
    (StorageResolver.forChurch as jest.Mock).mockResolvedValue({ name: "churchapps", provider: {} });
    const { controller } = makeController({ au: groupAu });
    expect(await controller.syncFileInfo("g1", "current.zip", {} as express.Request, {} as express.Response)).toEqual({ external: false });
  });

  it("rejects other file names and teams the caller is not on", async () => {
    useDrive();
    const { controller } = makeController({ au: groupAu });
    expect(((await controller.syncFileInfo("g1", "other.zip", {} as express.Request, {} as express.Response)) as JsonResult).status).toBe(400);
    expect(((await controller.syncFileInfo("g2", "current.zip", {} as express.Request, {} as express.Response)) as JsonResult).status).toBe(401);
  });
});
