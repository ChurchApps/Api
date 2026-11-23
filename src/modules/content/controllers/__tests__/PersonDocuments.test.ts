import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({
  Environment: { contentApi: "https://api.test/content", jwtSecret: "test-secret" },
  Permissions: { content: { edit: "contentEdit" }, people: { view: "peopleView", edit: "peopleEdit" } }
}));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" }, people: { view: "peopleView", edit: "peopleEdit" } } }));
jest.mock("../../helpers/StorageResolver", () => ({ StorageResolver: { forFile: jest.fn(), forChurch: jest.fn(), forUrl: jest.fn(), publicUrl: jest.fn(), keyFromUrl: jest.fn((u: string) => (u || "").split("?")[0]) } }));
jest.mock("../../helpers/ByosAuth", () => ({ BYOS_PROVIDERS: ["googledrive", "dropbox", "onedrive"] }));
jest.mock("../../helpers/MinistryStuffStorageProvider", () => ({ QuotaExceededError: class QuotaExceededError extends Error {} }));
const defaultProvider = { store: jest.fn(async () => "stored"), remove: jest.fn(async () => undefined) };
jest.mock("@churchapps/apihelper", () => ({
  __esModule: true,
  EnvironmentBase: { fileStore: "disk", s3Bucket: "bucket" },
  StorageProviderFactory: { getDefault: () => defaultProvider },
  inferContentTypeFromKey: jest.fn(() => "application/pdf"),
  resolveMaxUploadBytes: jest.fn((n: number) => n)
}));
jest.mock("../../helpers/GoogleDriveStorageProvider", () => ({ GoogleDriveStorageProvider: class {} }));
jest.mock("@aws-sdk/s3-presigned-post", () => ({ createPresignedPost: jest.fn() }));
jest.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: jest.fn() }));
jest.mock("@aws-sdk/client-s3", () => ({ S3Client: class {}, PutObjectCommand: class {}, GetObjectCommand: class {} }));

import { FileController } from "../FileController.js";
import { LinkController } from "../LinkController.js";
import { StorageResolver } from "../../helpers/StorageResolver.js";
import { isPublicDiskFilePath } from "../../helpers/PublicFileAccess.js";

const personFile = { id: "pf1", churchId: "c1", contentType: "person", contentId: "per1", fileName: "baptism.pdf", fileType: "application/pdf", externalId: "/c1/files/person/per1/baptism.pdf", contentPath: "https://api.test/content/files/download/pf1" };

function staff(perms: string[]) {
  return { churchId: "c1", groupIds: ["per1"], checkAccess: (p: string) => perms.includes(p) };
}

function makeFileController(opts: { au?: any; file?: any; files?: any[]; totalBytes?: number } = {}) {
  const repos = {
    file: {
      load: jest.fn(async () => opts.file ?? null),
      loadById: jest.fn(async () => opts.file ?? null),
      loadForContent: jest.fn(async () => opts.files ?? []),
      loadTotalBytes: jest.fn(async () => ({ size: opts.totalBytes ?? 0 })),
      save: jest.fn(async (f: any) => ({ ...f, id: f.id || "new1" })),
      delete: jest.fn(async () => undefined)
    },
    storageProvider: {}
  };
  const controller = new FileController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(opts.au);
  (controller as any).authUser = () => null;
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

function resSpy() {
  return { set: jest.fn(), redirect: jest.fn(), send: jest.fn() };
}

beforeEach(() => {
  (FileController as any).mintedUrlCache = new Map();
  (StorageResolver.forChurch as jest.Mock).mockReset();
  defaultProvider.store.mockClear();
  defaultProvider.remove.mockClear();
});

describe("person documents - listing", () => {
  it("rejects a church member without View People", async () => {
    const { controller, repos } = makeFileController({ au: staff(["contentEdit"]), files: [personFile] });
    const result: any = await (controller as any).getByContent("person", "per1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.file.loadForContent).not.toHaveBeenCalled();
  });

  it("lists a person's documents for staff with View People", async () => {
    const { controller } = makeFileController({ au: staff(["peopleView"]), files: [personFile] });
    const result: any = await (controller as any).getByContent("person", "per1", {}, {});
    expect(result).toEqual([personFile]);
  });

  it("hides a single person document from staff without View People", async () => {
    const { controller } = makeFileController({ au: staff(["contentEdit"]), file: personFile });
    const result: any = await (controller as any).get("pf1", {}, {});
    expect(result.status).toBe(401);
  });
});

describe("person documents - upload", () => {
  const upload = { contentType: "person", contentId: "per1", fileName: "baptism.pdf", fileType: "application/pdf", size: 4, fileContents: "data:application/pdf;base64," + Buffer.from("%PDF").toString("base64") };

  it("rejects a content editor without Edit People", async () => {
    const { controller, repos } = makeFileController({ au: staff(["contentEdit", "peopleView"]) });
    const result: any = await (controller as any).save({ body: [{ ...upload }] }, {});
    expect(result.status).toBe(401);
    expect(repos.file.save).not.toHaveBeenCalled();
  });

  it("stores the bytes on the default store, never a church's BYOS provider, and points at the private download route", async () => {
    const { controller, repos } = makeFileController({ au: staff(["peopleEdit"]) });
    const result: any = await (controller as any).save({ body: [{ ...upload }] }, {});
    expect(StorageResolver.forChurch).not.toHaveBeenCalled();
    expect(defaultProvider.store).toHaveBeenCalledWith("/c1/files/person/per1/baptism.pdf", "application/pdf", expect.any(Buffer));
    expect(result[0].contentPath).toBe("https://api.test/content/files/download/new1");
    expect(result[0].externalId).toBe("/c1/files/person/per1/baptism.pdf");
    expect(result[0].fileContents).toBeNull();
    expect(repos.file.save).toHaveBeenCalled();
  });

  it("never updates an existing row through a person upload", async () => {
    const { controller, repos } = makeFileController({ au: staff(["peopleEdit"]) });
    await (controller as any).save({ body: [{ ...upload, id: "someoneElsesFile" }] }, {});
    expect((repos.file.save.mock.calls[0] as any[])[0].id).toBeUndefined();
  });

  it("rejects a person id that could escape the folder", async () => {
    const { controller } = makeFileController({ au: staff(["peopleEdit"]) });
    const result: any = await (controller as any).save({ body: [{ ...upload, contentId: "../x" }] }, {});
    expect(result.status).toBe(400);
  });

  it("caps each person at 100 MB", async () => {
    const { controller } = makeFileController({ au: staff(["peopleEdit"]), totalBytes: 99999999 });
    const result: any = await (controller as any).save({ body: [{ ...upload }] }, {});
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("storage_quota_exceeded");
  });

  it("requires Edit People for a presigned person upload", async () => {
    const { controller } = makeFileController({ au: staff(["contentEdit"]) });
    const result: any = await (controller as any).getUploadUrl({ body: { contentType: "person", contentId: "per1", fileName: "a.pdf", size: 4, mimeType: "application/pdf" } }, {});
    expect(result.status).toBe(401);
  });
});

describe("person documents - download", () => {
  it("refuses the raw download route without a signed link", async () => {
    const { controller } = makeFileController({ file: personFile });
    const res = resSpy();
    const result: any = await (controller as any).download("pf1", { query: {} }, res);
    expect(result.status).toBe(401);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("only mints a download link for staff with View People", async () => {
    const { controller } = makeFileController({ au: staff(["contentEdit"]), file: personFile });
    const result: any = await (controller as any).downloadLink("pf1", {}, {});
    expect(result.status).toBe(401);
  });

  it("mints a short-lived link that the download route accepts, and rejects a tampered one", async () => {
    const { controller } = makeFileController({ au: staff(["peopleView"]), file: personFile });
    const link: any = await (controller as any).downloadLink("pf1", {}, {});
    const url = new URL(link.url);
    expect(url.pathname).toBe("/content/files/download/pf1");
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    expect(Number(exp)).toBeGreaterThan(Date.now() / 1000);
    expect(Number(exp)).toBeLessThanOrEqual(Date.now() / 1000 + 600);

    const tampered: any = await (controller as any).download("pf1", { query: { exp: String(Number(exp) + 1000), sig } }, resSpy());
    expect(tampered.status).toBe(401);

    const res = resSpy();
    const readLocal = jest.spyOn(require("../../helpers/PersonFileStorage.js").PersonFileStorage, "readLocal").mockReturnValue(Buffer.from("%PDF"));
    await (controller as any).download("pf1", { query: { exp, sig } }, res);
    expect(readLocal).toHaveBeenCalledWith("/c1/files/person/per1/baptism.pdf");
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.send).toHaveBeenCalled();
  });

  it("does not serve person documents from the public disk path", () => {
    expect(isPublicDiskFilePath("/c1/files/person/per1/baptism.pdf")).toBe(false);
  });
});

describe("person documents - delete", () => {
  it("requires Edit People, not content edit or group membership", async () => {
    const { controller, repos } = makeFileController({ au: staff(["contentEdit", "peopleView"]), file: personFile });
    const result: any = await (controller as any).delete("pf1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.file.delete).not.toHaveBeenCalled();
  });

  it("removes the stored object and the row for Edit People", async () => {
    const { controller, repos } = makeFileController({ au: staff(["peopleEdit"]), file: personFile });
    await (controller as any).delete("pf1", {}, {});
    expect(defaultProvider.remove).toHaveBeenCalledWith("/c1/files/person/per1/baptism.pdf");
    expect(repos.file.delete).toHaveBeenCalledWith("c1", "pf1");
  });
});

describe("person documents - links", () => {
  const personLink = { id: "l1", churchId: "c1", category: "personLink", linkData: "per1", text: "Certificate", url: "https://example.org/cert" };
  const navLink = { id: "l2", churchId: "c1", category: "website", text: "Home", url: "/" };

  function makeLinkController(opts: { au?: any; link?: any; links?: any[] } = {}) {
    const repos = {
      link: {
        load: jest.fn(async () => opts.link ?? null),
        loadAll: jest.fn(async () => opts.links ?? []),
        loadByCategory: jest.fn(async () => opts.links ?? []),
        loadByCategoryAndData: jest.fn(async () => opts.links ?? []),
        save: jest.fn(async (l: any) => ({ ...l, id: l.id || "nl1" })),
        sort: jest.fn(async () => undefined),
        delete: jest.fn(async () => undefined),
        convertToModel: (_c: string, d: any) => d,
        convertAllToModel: (_c: string, d: any) => d
      }
    };
    const controller = new LinkController();
    (controller as any).repos = repos;
    (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
    (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(opts.au);
    (controller as any).json = (obj: any, status: number) => ({ obj, status });
    (controller as any).bumpSiteCache = jest.fn();
    return { controller, repos };
  }

  it("never lists person links anonymously", async () => {
    const { controller } = makeLinkController({ links: [personLink, navLink] });
    expect(await (controller as any).loadAnon("c1", { query: { category: "personLink" } }, {})).toEqual([]);
    expect(await (controller as any).loadAnon("c1", { query: {} }, {})).toEqual([navLink]);
  });

  it("lists one person's links only for View People", async () => {
    const denied = makeLinkController({ au: staff(["contentEdit"]), links: [personLink] });
    expect(((await (denied.controller as any).loadAll({ query: { category: "personLink", linkData: "per1" } }, {})) as any).status).toBe(401);
    const allowed = makeLinkController({ au: staff(["peopleView"]), links: [personLink] });
    expect(await (allowed.controller as any).loadAll({ query: { category: "personLink", linkData: "per1" } }, {})).toEqual([personLink]);
    expect(allowed.repos.link.loadByCategoryAndData).toHaveBeenCalledWith("c1", "personLink", "per1");
  });

  it("adds and deletes person links with Edit People only", async () => {
    const editor = makeLinkController({ au: staff(["contentEdit"]), link: personLink });
    expect(((await (editor.controller as any).save({ body: [{ category: "personLink", linkData: "per1", text: "x", url: "https://x" }] }, {})) as any).status).toBe(401);
    expect(((await (editor.controller as any).delete("l1", {}, {})) as any).status).toBe(401);
    expect(editor.repos.link.delete).not.toHaveBeenCalled();

    const people = makeLinkController({ au: staff(["peopleEdit"]), link: personLink });
    const saved: any = await (people.controller as any).save({ body: [{ category: "personLink", linkData: "per1", text: "x", url: "https://x" }] }, {});
    expect(saved[0].id).toBe("nl1");
    await (people.controller as any).delete("l1", {}, {});
    expect(people.repos.link.delete).toHaveBeenCalledWith("c1", "l1");
  });
});
