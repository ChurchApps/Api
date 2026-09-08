import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
const mockEnv = { commonsMusicEditors: "" };
jest.mock("../../../shared/helpers/index", () => ({ Permissions: { server: { admin: { contentType: "Server", action: "Admin" } } }, Environment: mockEnv }));
jest.mock("../helpers/index", () => ({
  ContentLibraryHelper: { requestApiBase: () => "http://api", signedPendingUrl: jest.fn(async () => "signed"), fileUrls: () => ({}) },
  PublishHelper: { discardProposed: jest.fn(async () => {}), editablePayload: jest.fn(async () => ({})) },
  ReviewerHelper: jest.requireActual("../helpers/ReviewerHelper").ReviewerHelper,
  SubmissionHelper: { createDraft: jest.fn(), storeInline: jest.fn(), recordFile: jest.fn(), removeFile: jest.fn(), submit: jest.fn() },
  userNames: jest.fn(async () => ({})),
  fileSpec: () => undefined,
  INLINE_MAX_BYTES: 1,
  DEFAULT_MAX_FILE_BYTES: 1
}));

import { CommonsSubmissionController } from "../controllers/CommonsSubmissionController.js";
import { PublishHelper } from "../helpers/index.js";

function controller(status = "pending", au: any = { id: "user0000001", checkAccess: () => false }) {
  const repos: any = {
    submission: { loadById: jest.fn(async () => ({ id: "sub00000001", assetId: "asset000001", submittedBy: "user0000001", status })), update: jest.fn(async () => {}) },
    asset: { loadById: jest.fn(async () => ({ id: "asset000001", assetType: "song", status: "pending" })) },
    assetFile: { loadBySubmission: jest.fn(async () => []), loadLive: jest.fn(async () => []) }
  };
  const c = new CommonsSubmissionController();
  (c as any).repos = repos;
  (c as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (c as any).json = (obj: any, statusCode: number) => ({ obj, status: statusCode });
  return { controller: c, repos };
}

describe("CommonsSubmissionController.own", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.commonsMusicEditors = "";
  });
  const stranger = (email?: string) => ({ id: "other000001", email, checkAccess: () => false });

  it("hides someone else's submission from a plain user", async () => {
    const { controller: c } = controller("pending", stranger("other@example.com"));
    expect((await c.get({ params: { id: "sub00000001" } } as any, {} as any) as any).status).toBe(404);
  });

  it("lets a music editor read someone else's submission, like a server admin", async () => {
    mockEnv.commonsMusicEditors = "other@example.com";
    const { controller: c } = controller("pending", stranger("other@example.com"));
    expect((await c.get({ params: { id: "sub00000001" } } as any, {} as any) as any).id).toBe("sub00000001");
    const { controller: admin } = controller("pending", { id: "admin000001", checkAccess: () => true });
    expect((await admin.get({ params: { id: "sub00000001" } } as any, {} as any) as any).id).toBe("sub00000001");
  });
});

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
