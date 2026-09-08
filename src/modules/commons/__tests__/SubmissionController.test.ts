import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../controllers/CommonsBaseController", () => ({
  CommonsBaseController: class {
    json(obj: any, status: number) { return { obj, status }; }
    actionWrapperAuth(req: any, res: any, fn: any) { return (this as any).actionWrapper(req, res, async (au: any) => (au?.id ? fn(au) : (this as any).json({ errors: ["Sign in required"] }, 401))); }
  }
}));
jest.mock("../../../shared/helpers/index", () => ({ Permissions: { server: { admin: { contentType: "Server", action: "Admin" } } } }));
jest.mock("../helpers/index", () => ({
  ContentLibraryHelper: { requestApiBase: () => "http://api", signedPendingUrl: jest.fn(async () => "signed"), fileUrls: () => ({}) },
  PublishHelper: { discardProposed: jest.fn(async () => {}), editablePayload: jest.fn(async () => ({})) },
  SubmissionHelper: { createDraft: jest.fn(), storeInline: jest.fn(), recordFile: jest.fn(), removeFile: jest.fn(), submit: jest.fn(), typeOf: (p: any, a: any) => p?.type || (a?.publishedSubmissionId ? "correction" : "new") },
  userNames: jest.fn(async () => ({})),
  fileSpec: () => undefined,
  notAcceptedMessage: (_d: any, n: string) => `${n} is not an accepted file`,
  INLINE_MAX_BYTES: 1,
  DEFAULT_MAX_FILE_BYTES: 1
}));

import { CommonsSubmissionController } from "../controllers/CommonsSubmissionController.js";
import { PublishHelper } from "../helpers/index.js";

function controller(status = "pending") {
  const repos: any = {
    submission: {
      loadById: jest.fn(async () => ({ id: "sub00000001", assetId: "asset000001", submittedBy: "user0000001", status })),
      update: jest.fn(async () => {}),
      loadMine: jest.fn(async () => [{ id: "sub00000001", assetId: "asset000001", submittedBy: "user0000001", status, type: "correction", publisherUserId: "user0000001", publishedSubmissionId: "sub00000000", payload: {} }])
    },
    asset: { loadById: jest.fn(async () => ({ id: "asset000001", assetType: "song", status: "pending" })) }
  };
  const au = { id: "user0000001", checkAccess: () => false };
  const c = new CommonsSubmissionController();
  (c as any).repos = repos;
  (c as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (c as any).json = (obj: any, statusCode: number) => ({ obj, status: statusCode });
  return { controller: c, repos };
}

describe("CommonsSubmissionController.withdraw", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the submission to draft and keeps files and the pending asset", async () => {
    const { controller: c, repos } = controller();
    expect(await c.withdraw({ params: { id: "sub00000001" } } as any, {} as any)).toEqual({ status: "draft" });
    expect(repos.submission.update).toHaveBeenCalledWith("sub00000001", { status: "draft" });
    expect(PublishHelper.discardProposed).not.toHaveBeenCalled();
  });

  it("refuses anything that is not pending", async () => {
    const { controller: c, repos } = controller("draft");
    const result: any = await c.withdraw({ params: { id: "sub00000001" } } as any, {} as any);
    expect(result.status).toBe(400);
    expect(repos.submission.update).not.toHaveBeenCalled();
  });
});

describe("CommonsSubmissionController proposal type", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists the type on /mine", async () => {
    const { controller: c } = controller();
    const rows: any = await c.mine({ query: {} } as any, {} as any);
    expect(rows[0]).toMatchObject({ id: "sub00000001", type: "correction", isNewAsset: false, isThirdParty: false });
  });

  it("re-resolves the type column when a draft's payload changes", async () => {
    const { controller: c, repos } = controller("draft");
    repos.asset.loadById.mockResolvedValueOnce({ id: "asset000001", assetType: "song", status: "published", publishedSubmissionId: "sub00000000" });
    const result: any = await c.update({ params: { id: "sub00000001" }, body: { payload: { name: "x", type: "removal" }, note: "please take this down for me" } } as any, {} as any);
    expect(result.status).toBe(204);
    expect(repos.submission.update).toHaveBeenCalledWith("sub00000001", { payload: { name: "x", type: "removal" }, type: "removal", note: "please take this down for me" });
    repos.asset.loadById.mockResolvedValueOnce({ id: "asset000001", assetType: "song", status: "published", publishedSubmissionId: "sub00000000" });
    await c.update({ params: { id: "sub00000001" }, body: { payload: { name: "x" } } } as any, {} as any);
    expect(repos.submission.update).toHaveBeenLastCalledWith("sub00000001", expect.objectContaining({ type: "correction" }));
  });
});
