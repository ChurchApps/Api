import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Environment: { contentApi: "https://api.test/content" }, Permissions: { content: { edit: "contentEdit" } } }));
jest.mock("../../helpers/StorageResolver", () => ({ StorageResolver: { forFile: jest.fn(), forChurch: jest.fn(), forUrl: jest.fn(), publicUrl: jest.fn() } }));
jest.mock("../../helpers/ByosAuth", () => ({ BYOS_PROVIDERS: ["googledrive", "dropbox", "onedrive"] }));
jest.mock("../../helpers/MinistryStuffStorageProvider", () => ({ QuotaExceededError: class QuotaExceededError extends Error {} }));

import { FileController } from "../FileController.js";
import { StorageResolver } from "../../helpers/StorageResolver.js";

function makeController(opts: any = {}) {
  const repos = {
    file: { loadById: jest.fn(async () => opts.file ?? null) },
    storageProvider: {}
  };
  const controller = new FileController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).authUser = () => opts.au ?? null;
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
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
