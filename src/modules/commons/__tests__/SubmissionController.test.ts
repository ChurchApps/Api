import "reflect-metadata";
import type express from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import type { Asset, AssetFile, Submission, SubmissionPayload } from "../models/index.js";
import type { QueueRow } from "../repositories/SubmissionRepo.js";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
// apihelper's published build is ESM-only, which Jest cannot parse. These helpers import it at load.
jest.mock("../../membership/helpers/MauticHelper.js", () => ({ MauticHelper: { createAndTag: jest.fn(async (): Promise<undefined> => undefined) } }));
jest.mock("../helpers/CommonsMailHelper.js", () => ({ CommonsMailHelper: { notifySubmittedInternal: jest.fn() } }));
jest.mock("../controllers/CommonsBaseController", () => ({
  CommonsBaseController: class {
    declare actionWrapper: (req: express.Request, res: express.Response, action: (au: AuthenticatedUser) => Promise<unknown>) => unknown;
    json(obj: unknown, status: number) { return { obj, status }; }
    actionWrapperAuth(req: express.Request, res: express.Response, fn: (au: AuthenticatedUser) => Promise<unknown>) { return this.actionWrapper(req, res, async (au: AuthenticatedUser) => (au?.id ? fn(au) : this.json({ errors: ["Sign in required"] }, 401))); }
  }
}));
const mockEnv = { commonsMusicEditors: "" };
jest.mock("../../../shared/helpers/index", () => ({ Permissions: { server: { admin: { contentType: "Server", action: "Admin" } } }, Environment: mockEnv }));
jest.mock("../helpers/index", () => ({
  ContentLibraryHelper: { requestApiBase: () => "http://api", signedPendingUrl: jest.fn(async () => "signed"), fileUrls: () => ({}) },
  PublishHelper: { discardProposed: jest.fn(async () => {}), editablePayload: jest.fn(async () => ({})) },
  ReviewerHelper: jest.requireActual("../helpers/ReviewerHelper").ReviewerHelper,
  SubmissionHelper: { createDraft: jest.fn(), storeInline: jest.fn(), recordFile: jest.fn(), removeFile: jest.fn(), submit: jest.fn(), typeOf: (p: SubmissionPayload | undefined, a: Asset | undefined) => p?.type || (a?.publishedSubmissionId ? "correction" : "new") },
  userNames: jest.fn(async () => ({})),
  isServerAdmin: jest.fn(async () => false),
  fileSpec: (): undefined => undefined,
  notAcceptedMessage: (_d: unknown, n: string) => `${n} is not an accepted file`,
  INLINE_MAX_BYTES: 1,
  DEFAULT_MAX_FILE_BYTES: 1
}));

import { CommonsSubmissionController } from "../controllers/CommonsSubmissionController.js";
import { isServerAdmin, PublishHelper, SubmissionHelper } from "../helpers/index.js";

type JsonOut = { obj: unknown; status: number };
type Result = { id?: string; status?: number | string };
const request = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;
type UpdateRequest = Parameters<CommonsSubmissionController["update"]>[0];
const updateRequest = (r: Partial<UpdateRequest>) => r as UpdateRequest;

function controller(status = "pending", au: Partial<AuthenticatedUser> = { id: "user0000001", checkAccess: () => false }) {
  const repos = {
    submission: {
      loadById: jest.fn(async (): Promise<Submission> => ({ id: "sub00000001", assetId: "asset000001", submittedBy: "user0000001", status })),
      update: jest.fn(async (_id: string, _fields: Partial<Submission>) => {}),
      loadMine: jest.fn(async (): Promise<QueueRow[]> => [{ id: "sub00000001", assetId: "asset000001", submittedBy: "user0000001", status, type: "correction", publisherUserId: "user0000001", publishedSubmissionId: "sub00000000", payload: {} }])
    },
    asset: { loadById: jest.fn(async (): Promise<Asset> => ({ id: "asset000001", assetType: "song", status: "pending" })), isPublisher: jest.fn(async (a: Asset | undefined, u?: string) => !!u && a?.publisherUserId === u), loadPublisherIds: jest.fn(async (a: Asset) => [a?.publisherUserId].filter(Boolean)) },
    assetFile: { loadBySubmission: jest.fn(async (): Promise<AssetFile[]> => []), loadLive: jest.fn(async (): Promise<AssetFile[]> => []) }
  };
  const c = new CommonsSubmissionController();
  Object.assign(c, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (u: AuthenticatedUser) => Promise<unknown>) => action(au as AuthenticatedUser),
    json: (obj: unknown, statusCode: number): JsonOut => ({ obj, status: statusCode })
  });
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
    expect((await c.get(request({ params: { id: "sub00000001" } }), res) as Result).status).toBe(404);
  });

  it("lets a music editor read someone else's submission, like a server admin", async () => {
    mockEnv.commonsMusicEditors = "other@example.com";
    const { controller: c } = controller("pending", stranger("other@example.com"));
    expect((await c.get(request({ params: { id: "sub00000001" } }), res) as Result).id).toBe("sub00000001");
    const { controller: admin } = controller("pending", { id: "admin000001", checkAccess: () => true });
    expect((await admin.get(request({ params: { id: "sub00000001" } }), res) as Result).id).toBe("sub00000001");
  });
});

describe("CommonsSubmissionController.withdraw", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the submission to draft and keeps files and the pending asset", async () => {
    const { controller: c, repos } = controller();
    expect(await c.withdraw(request({ params: { id: "sub00000001" } }), res)).toEqual({ status: "draft" });
    expect(repos.submission.update).toHaveBeenCalledWith("sub00000001", { status: "draft" });
    expect(PublishHelper.discardProposed).not.toHaveBeenCalled();
  });

  it("refuses anything that is not pending", async () => {
    const { controller: c, repos } = controller("draft");
    const result = await c.withdraw(request({ params: { id: "sub00000001" } }), res) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.submission.update).not.toHaveBeenCalled();
  });
});

describe("CommonsSubmissionController proposal type", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists the type on /mine", async () => {
    const { controller: c } = controller();
    const rows = await c.mine(request({ query: {} }), res) as QueueRow[];
    expect(rows[0]).toMatchObject({ id: "sub00000001", type: "correction", isNewAsset: false, isThirdParty: false });
  });

  it("re-resolves the type column when a draft's payload changes", async () => {
    const { controller: c, repos } = controller("draft");
    repos.asset.loadById.mockResolvedValueOnce({ id: "asset000001", assetType: "song", status: "published", publishedSubmissionId: "sub00000000" });
    const result = await c.update(updateRequest({ params: { id: "sub00000001" }, body: { payload: { name: "x", type: "removal" }, note: "please take this down for me" } }), res) as JsonOut;
    expect(result.status).toBe(204);
    expect(repos.submission.update).toHaveBeenCalledWith("sub00000001", { payload: { name: "x", type: "removal" }, type: "removal", note: "please take this down for me" });
    repos.asset.loadById.mockResolvedValueOnce({ id: "asset000001", assetType: "song", status: "published", publishedSubmissionId: "sub00000000" });
    await c.update(updateRequest({ params: { id: "sub00000001" }, body: { payload: { name: "x" } } }), res);
    expect(repos.submission.update).toHaveBeenLastCalledWith("sub00000001", expect.objectContaining({ type: "correction" }));
  });
});

describe("CommonsSubmissionController.submit — reviewer bypass", () => {
  beforeEach(() => jest.clearAllMocks());
  const req = request({ params: { id: "sub00000001" } });

  it("marks a reviewer's own draft, looking a server admin up when the site token carries no permissions", async () => {
    (SubmissionHelper.submit as jest.Mock).mockResolvedValue({ ok: true, value: { status: "pending" } });
    const { controller: c } = controller("draft");
    await c.submit(req, res);
    expect(SubmissionHelper.submit).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.anything(), { byReviewer: false });
    (isServerAdmin as jest.Mock).mockResolvedValueOnce(true);
    await c.submit(req, res);
    expect(isServerAdmin).toHaveBeenCalledWith("user0000001");
    expect(SubmissionHelper.submit).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.anything(), { byReviewer: true });
  });

  it("never passes the bypass to a contributor's draft that a reviewer submits", async () => {
    (SubmissionHelper.submit as jest.Mock).mockResolvedValue({ ok: true, value: { status: "pending" } });
    const { controller: c } = controller("draft", { id: "admin000001", checkAccess: () => true });
    await c.submit(req, res);
    expect(SubmissionHelper.submit).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.anything(), { byReviewer: false });
  });
});
