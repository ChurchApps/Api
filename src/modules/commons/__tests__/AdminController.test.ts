import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../helpers/CommonsMauticHelper.js", () => ({ CommonsMauticHelper: { tagUser: jest.fn(async () => {}), afterSave: jest.fn(async () => {}), afterSubmit: jest.fn(async () => {}), syncWriter: jest.fn(async () => {}) } }));
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
const mockEnv = { worshipCommonsRoot: "http://localhost:3104", commonsMusicEditors: "" };
jest.mock("../../../shared/helpers/index", () => ({
  Permissions: { server: { admin: { contentType: "Server", action: "Admin" } } },
  Environment: mockEnv
}));
const notifyTakedown = jest.fn(async () => {});
const notifyReportResolved = jest.fn(async () => {});
jest.mock("../helpers/index", () => ({
  CommonsMailHelper: { notifyTakedown, notifyReportResolved },
  DuplicateHelper: jest.requireActual("../helpers/DuplicateHelper").DuplicateHelper,
  ContentLibraryHelper: {
    requestApiBase: () => "http://api",
    signedPendingUrl: jest.fn(async (id: string, name: string) => `signed:${id}/${name}`),
    previewToken: () => "tok",
    fileUrls: () => ({}),
    packagePrefix: (dir: string) => `commons/${dir}`,
    listLiveKeys: jest.fn(async (): Promise<string[]> => [])
  },
  ReviewerHelper: jest.requireActual("../helpers/ReviewerHelper").ReviewerHelper,
  PublishHelper: {
    approve: jest.fn(async () => {}),
    reject: jest.fn(async () => {}),
    requestChanges: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
    editablePayload: jest.fn(async () => ({ name: "Live", license: "WC", detail: {} })),
    diffFields: jest.fn(() => [{ key: "name", from: "Live", to: "Proposed" }]),
    fileSummary: (files: AssetFile[]) => files.map((f) => ({ name: f.name, action: f.action, role: f.name }))
  },
  QualityHelper: { score: jest.fn(async () => ({})) },
  userNames: jest.fn(async () => ({ user0000001: "Sub Mitter", owner000001: "Ow Ner" })),
  isServerAdmin: jest.fn(async () => false)
}));

import { CommonsAdminController } from "../controllers/CommonsAdminController.js";
import { isServerAdmin, PublishHelper } from "../helpers/index.js";
import { CommonsMauticHelper } from "../helpers/CommonsMauticHelper.js";
import type express from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import type { AssetDetailField } from "@churchapps/helpers";
import type { Asset, AssetFile, Contributor, Report, Song, SongView, Submission } from "../models/index.js";
import type { QueueRow } from "../repositories/SubmissionRepo.js";

/** What the mocked `json` returns for error responses. */
type JsonOut = { obj: { errors?: string[] }; status: number; musicEditor?: boolean; declined?: string[] };
/** The fields of the reviewer submission detail these tests read. */
interface SubmissionDetail {
  id: string;
  type: string;
  isThirdParty: boolean;
  isNewAsset: boolean;
  files: { url: string }[];
  diff: { fields: { key: string; from: unknown; to: unknown }[] };
  previewUrl: string;
  submittedByName: string;
  detailFields?: AssetDetailField[];
  live: { contributors: Contributor[] };
  qualityDetail: unknown;
}
/** The fields of a reviewer queue row these tests read. */
interface QueueOut extends QueueRow {
  qualityDetail?: unknown;
  rightsFlag: boolean;
  possibleDuplicate: boolean;
  isNewAsset: boolean;
}
type MockFn = (...args: never[]) => unknown;
type RepoOverrides = Partial<Record<"submission" | "asset" | "assetFile" | "report" | "song", Record<string, MockFn>>>;
type ReviewerUser = Pick<AuthenticatedUser, "id" | "email" | "checkAccess">;

const res = {} as express.Response;

const pending = (): Submission => ({ id: "sub00000001", assetId: "asset000001", submittedBy: "user0000001", status: "pending", type: "correction", payload: { name: "Proposed" } });

function adminController(overrides: RepoOverrides = {}, admin = true, au: ReviewerUser = { id: "admin000001", email: "admin@example.com", checkAccess: () => admin }) {
  const repos = {
    submission: {
      loadById: jest.fn(async (): Promise<Submission> => pending()),
      loadQueue: jest.fn(async (): Promise<QueueRow[]> => []),
      loadMine: jest.fn(async (): Promise<QueueRow[]> => []),
      countSubmitterStats: jest.fn(async () => ({ total: 3, approved: 2 })),
      countByStatus: jest.fn(async () => 4)
    },
    asset: {
      loadById: jest.fn(async (): Promise<Asset> => ({ id: "asset000001", assetType: "song", name: "Live", status: "published", publisherUserId: "owner000001", publishedSubmissionId: "sub00000000" })),
      update: jest.fn(async () => {}),
      loadByIds: jest.fn(async (): Promise<Asset[]> => []),
      loadByPublisher: jest.fn(async (): Promise<Asset[]> => []),
      isPublisher: jest.fn(async (a: Asset, u?: string) => !!u && a?.publisherUserId === u),
      loadPublisherIds: jest.fn(async (a: Asset) => [a?.publisherUserId].filter(Boolean)),
      setPublishers: jest.fn(async () => {})
    },
    assetFile: { loadBySubmission: jest.fn(async (): Promise<AssetFile[]> => [{ name: "tune.abc", action: "add" }]), loadLive: jest.fn(async (): Promise<AssetFile[]> => []) },
    report: { loadById: jest.fn(async (): Promise<Report> => ({ id: "rep00000001", assetId: "asset000001", reason: "copyright", status: "open" })), update: jest.fn(async () => {}), loadAll: jest.fn(async (): Promise<Report[]> => []) },
    song: { loadPublishedForDuplicates: jest.fn(async (): Promise<SongView[]> => []), loadSatellite: jest.fn(async (): Promise<Song> => ({ assetId: "asset000001", contributors: JSON.stringify([{ name: "Ada", what: "new song", submissionId: "sub00000000" }]) })) }
  };
  for (const [k, v] of Object.entries(overrides)) Object.assign(repos[k as keyof RepoOverrides], v);
  const controller = new CommonsAdminController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (au: AuthenticatedUser) => unknown) => action(au as AuthenticatedUser),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

const req = (body: Record<string, unknown> = {}, id = "sub00000001", query: Record<string, string> = {}) => ({ params: { id }, body, query, headers: {} } as express.Request<{ id: string }>);

/** A signed-in user listed in COMMONS_MUSIC_EDITORS by email, with no Server/Admin permission. */
function editorController(overrides: RepoOverrides = {}) {
  mockEnv.commonsMusicEditors = "someone0001, editor@example.com";
  return adminController(overrides, false, { id: "editor00001", email: "Editor@Example.com", checkAccess: () => false });
}

describe("admin submissions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.commonsMusicEditors = "";
  });

  it("returns pendingCount on /status only for admins", async () => {
    const { controller, repos } = adminController();
    expect(await controller.status(req(), res)).toEqual({ admin: true, musicEditor: false, pendingCount: 4 });
    expect(repos.submission.countByStatus).toHaveBeenCalledWith("pending");
    const { controller: visitor } = adminController({}, false);
    expect(await visitor.status(req(), res)).toEqual({ admin: false, musicEditor: false });
  });

  it("finds a server admin on /status whose token has no church permissions (the WorshipCommons site's)", async () => {
    (isServerAdmin as jest.Mock).mockResolvedValueOnce(true);
    const { controller } = adminController({}, false);
    expect(await controller.status(req(), res)).toEqual({ admin: true, musicEditor: false, pendingCount: 4 });
    expect(isServerAdmin).toHaveBeenCalledWith("admin000001");
  });

  it("gates everything on Server/Admin", async () => {
    const { controller } = adminController({}, false);
    expect(await controller.submissions(req(), res)).toEqual({ obj: {}, status: 401 });
    expect(await controller.approve(req(), res)).toEqual({ obj: {}, status: 401 });
    expect(await controller.remove(req({ reason: "policy" }), res)).toEqual({ obj: {}, status: 401 });
  });

  it("approves a pending submission through PublishHelper", async () => {
    const { controller } = adminController();
    expect(await controller.approve(req({ note: "ok" }), res)).toEqual({ status: "approved", assetId: "asset000001", declined: [] });
    expect(PublishHelper.approve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "sub00000001" }), expect.objectContaining({ id: "asset000001" }), "admin000001", "ok", []);
  });

  it("lets a reviewer approve their own submission", async () => {
    const { controller } = adminController({ submission: { loadById: jest.fn(async () => ({ ...pending(), submittedBy: "admin000001" })) } });
    expect(await controller.approve(req(), res)).toEqual({ status: "approved", assetId: "asset000001", declined: [] });
    expect(PublishHelper.approve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ submittedBy: "admin000001" }), expect.anything(), "admin000001", undefined, []);
  });

  it("refuses to approve anything not pending or whose asset was removed", async () => {
    const { controller, repos } = adminController({ submission: { loadById: jest.fn(async () => ({ ...pending(), status: "approved" })) } });
    expect((await controller.approve(req(), res) as JsonOut).status).toBe(400);
    repos.submission.loadById.mockResolvedValueOnce(pending());
    repos.asset.loadById.mockResolvedValueOnce({ id: "asset000001", status: "removed" });
    expect((await controller.approve(req(), res) as JsonOut).status).toBe(400);
    expect(PublishHelper.approve).not.toHaveBeenCalled();
  });

  it("rejection needs a known reason and a note the submitter can learn from", async () => {
    const { controller } = adminController();
    expect((await controller.reject(req({ reason: "quality" }), res) as JsonOut).status).toBe(400);
    expect((await controller.reject(req({ reason: "meh", note: "x" }), res) as JsonOut).status).toBe(400);
    expect(await controller.reject(req({ reason: "quality", note: "needs a bridge" }), res)).toEqual({ status: "rejected" });
    expect(PublishHelper.reject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "sub00000001" }), expect.objectContaining({ id: "asset000001" }), "admin000001", "quality", "needs a bridge");
  });

  it("accepts ccli as a reject reason", async () => {
    const { controller } = adminController();
    expect(await controller.reject(req({ reason: "ccli", note: "in the CCLI catalog" }), res)).toEqual({ status: "rejected" });
    expect(PublishHelper.reject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "sub00000001" }), expect.objectContaining({ id: "asset000001" }), "admin000001", "ccli", "in the CCLI catalog");
  });

  it("detail carries the diff, signed pending urls, third-party badge and a token-bearing preview url", async () => {
    const { controller } = adminController();
    const detail = await controller.submission(req(), res) as SubmissionDetail;
    expect(detail.isThirdParty).toBe(true);
    expect(detail.isNewAsset).toBe(false);
    expect(detail.files[0].url).toBe("signed:sub00000001/tune.abc");
    expect(detail.diff.fields).toEqual([{ key: "name", from: "Live", to: "Proposed" }]);
    expect(detail.previewUrl).toBe("http://localhost:3104/preview/submission/sub00000001?token=tok");
    expect(detail.submittedByName).toBe("Sub Mitter");
    expect(detail.detailFields?.some((f: AssetDetailField) => f.key === "chordPro")).toBe(true);
  });

  it("carries the proposal type on the queue and the detail, and the song's contributors on the detail", async () => {
    const { controller } = adminController({ submission: { loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song" }]) } });
    const rows = await controller.submissions(req(), res) as QueueOut[];
    expect(rows[0].type).toBe("correction");
    const detail = await controller.submission(req(), res) as SubmissionDetail;
    expect(detail.type).toBe("correction");
    expect(detail.live.contributors).toEqual([{ name: "Ada", what: "new song", submissionId: "sub00000000" }]);
    expect(detail.detailFields.map((f: AssetDetailField) => f.key)).toEqual(expect.arrayContaining(["parentSongId", "relationLabel", "translator", "arranger"]));
  });

  it("exposes qualityDetail from the payload on the queue and detail, without leaking payload on the queue", async () => {
    const qualityDetail = { heuristic: 26, parts: ["demo", "scripture", "themes"], llm: 0, notes: "completeness heuristic only — not an AI judgment" };
    const { controller, repos } = adminController({
      submission: {
        loadById: jest.fn(async () => ({ ...pending(), payload: { name: "Proposed", qualityDetail } })),
        loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song", payload: { name: "Proposed", qualityDetail } }])
      }
    });
    const rows = await controller.submissions(req(), res) as QueueOut[];
    expect(rows[0].qualityDetail).toEqual(qualityDetail);
    expect(rows[0].payload).toBeUndefined();
    expect(rows[0].rightsFlag).toBe(false);
    expect(rows[0].possibleDuplicate).toBe(false);
    repos.submission.loadById.mockResolvedValueOnce({ ...pending(), payload: { name: "Proposed", qualityDetail } });
    const detail = await controller.submission(req(), res) as SubmissionDetail;
    expect(detail.qualityDetail).toEqual(qualityDetail);
  });

  it("flags GEMA/PRS/publisher answers on the queue without leaking payload", async () => {
    const { controller } = adminController({ submission: { loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song", payload: { name: "Proposed", detail: { proAnswer: "Yes — registered with GEMA" } } }]) } });
    const rows = await controller.submissions(req(), res) as QueueOut[];
    expect(rows[0].rightsFlag).toBe(true);
    expect(rows[0].payload).toBeUndefined();
  });

  it("flags a near-duplicate when the same submitter has another pending or published asset with a similar name", async () => {
    const { controller } = adminController({
      submission: {
        loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song", assetName: "Amazing Grace Chorus", payload: { name: "Amazing Grace Chorus" } }]),
        loadMine: jest.fn(async () => [{ assetId: "asset000777", payload: { name: "Amazing Grace" }, assetName: "Amazing Grace" }])
      },
      asset: { loadByPublisher: jest.fn(async () => [{ id: "asset000777", name: "Amazing Grace", status: "published" }]) }
    });
    const rows = await controller.submissions(req(), res) as QueueOut[];
    expect(rows[0].possibleDuplicate).toBe(true);
    expect(rows[0].payload).toBeUndefined();
  });

  it("flags a duplicate of a published song nobody in this submitter's history wrote", async () => {
    const { controller } = adminController({
      submission: { loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song", assetName: "The Old Rugged Cross", payload: { name: "The Old Rugged Cross", detail: { writer: "A Newcomer" } } }]) },
      song: { loadPublishedForDuplicates: jest.fn(async () => [{ id: "asset000555", title: "Old Rugged Cross", writer: "George Bennard", chordPro: "" }]) }
    });
    const rows = await controller.submissions(req(), res) as QueueOut[];
    expect(rows[0].possibleDuplicate).toBe(true);
  });

  it("flags a published song whose first sung line matches, even under a different title", async () => {
    const { controller } = adminController({
      submission: { loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song", assetName: "Grace Astounding", payload: { name: "Grace Astounding", detail: { chordPro: "Verse 1\n[G]Amazing grace! how [C]sweet the [G]sound," } } }]) },
      song: { loadPublishedForDuplicates: jest.fn(async () => [{ id: "asset000556", title: "Amazing Grace", writer: "John Newton", chordPro: "{title: Amazing Grace}\n\nVerse 1\nAmazing grace! how sweet the sound," }]) }
    });
    const rows = await controller.submissions(req(), res) as QueueOut[];
    expect(rows[0].possibleDuplicate).toBe(true);
  });

  it("does not flag the same asset as a duplicate of itself", async () => {
    const { controller } = adminController({
      submission: {
        loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song", assetName: "Hope", payload: { name: "Hope" } }]),
        loadMine: jest.fn(async () => [{ assetId: "asset000001", payload: { name: "Hope" } }])
      },
      asset: { loadByPublisher: jest.fn(async () => [{ id: "asset000001", name: "Hope", status: "pending" }]) },
      song: { loadPublishedForDuplicates: jest.fn(async () => [{ id: "asset000001", title: "Hope", writer: "Anon", chordPro: "" }]) }
    });
    const rows = await controller.submissions(req(), res) as QueueOut[];
    expect(rows[0].possibleDuplicate).toBe(false);
  });
});

describe("request changes", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends a pending submission back to draft with the note", async () => {
    const { controller } = adminController();
    expect(await controller.requestChanges(req({ note: "  Please add the bridge chords.  " }), res)).toEqual({ status: "draft" });
    expect(PublishHelper.requestChanges).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "sub00000001" }), "admin000001", "Please add the bridge chords.");
  });

  it("needs a note and clips it to 500 characters", async () => {
    const { controller } = adminController();
    expect((await controller.requestChanges(req({}), res) as JsonOut).status).toBe(400);
    expect((await controller.requestChanges(req({ note: "   " }), res) as JsonOut).status).toBe(400);
    await controller.requestChanges(req({ note: "x".repeat(600) }), res);
    expect((PublishHelper.requestChanges as jest.Mock).mock.calls[0][3]).toHaveLength(500);
  });

  it("409s when the submission is not pending", async () => {
    const { controller } = adminController({ submission: { loadById: jest.fn(async () => ({ ...pending(), status: "draft" })) } });
    const out = await controller.requestChanges(req({ note: "again" }), res) as JsonOut;
    expect(out.status).toBe(409);
    expect(PublishHelper.requestChanges).not.toHaveBeenCalled();
  });

  it("404s an unknown submission and 401s a non-reviewer", async () => {
    const { controller } = adminController({ submission: { loadById: jest.fn(async (): Promise<Submission | undefined> => undefined) } });
    expect((await controller.requestChanges(req({ note: "x" }), res) as JsonOut).status).toBe(404);
    const { controller: visitor } = adminController({}, false);
    expect(await visitor.requestChanges(req({ note: "x" }), res)).toEqual({ obj: {}, status: 401 });
  });
});

describe("partial approve", () => {
  beforeEach(() => jest.clearAllMocks());
  const proposed = [{ name: "lyrics.chordpro", action: "replace" }, { name: "demoAudio.mp3", action: "add" }, { name: "sheetPdf.pdf", action: "add" }];

  it("passes validated declines through to PublishHelper and echoes them", async () => {
    const { controller } = adminController({ assetFile: { loadBySubmission: jest.fn(async () => proposed), loadLive: jest.fn(async () => [{ name: "lyrics.chordpro" }]) } });
    const out = await controller.approve(req({ note: "score is good", declineFiles: [{ name: "sheetPdf.pdf", reason: " blurry scan " }] }), res);
    expect(out).toEqual({ status: "approved", assetId: "asset000001", declined: ["sheetPdf.pdf"] });
    expect(PublishHelper.approve).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "admin000001", "score is good", [{ name: "sheetPdf.pdf", reason: "blurry scan" }]);
  });

  it("refuses names outside the proposal, missing reasons, duplicates and a non-list body", async () => {
    const { controller } = adminController({ assetFile: { loadBySubmission: jest.fn(async () => proposed), loadLive: jest.fn(async (): Promise<AssetFile[]> => []) } });
    for (const declineFiles of [
      [{ name: "cover.webp", reason: "x" }],
      [{ name: "sheetPdf.pdf" }],
      [{ name: "sheetPdf.pdf", reason: "a" }, { name: "sheetPdf.pdf", reason: "b" }],
      "sheetPdf.pdf"
    ]) {
      const out = await controller.approve(req({ declineFiles }), res) as JsonOut;
      expect(out.status).toBe(400);
    }
    expect(PublishHelper.approve).not.toHaveBeenCalled();
  });

  it("only lets a required file be declined when the live asset still has one", async () => {
    const template = { id: "asset000001", assetType: "freeshow/template", name: "Wide", status: "published", publisherUserId: "owner000001", publishedSubmissionId: "sub00000000" };
    const files = [{ name: "content.fstemplate", action: "replace" }];
    const decline = { declineFiles: [{ name: "content.fstemplate", reason: "keep the old one" }] };
    const { controller, repos } = adminController({ asset: { loadById: jest.fn(async () => template) }, assetFile: { loadBySubmission: jest.fn(async () => files), loadLive: jest.fn(async (): Promise<AssetFile[]> => []) } });
    expect((await controller.approve(req(decline), res) as JsonOut).status).toBe(400);
    repos.assetFile.loadLive.mockResolvedValueOnce([{ name: "content.fstemplate" }]);
    expect((await controller.approve(req(decline), res) as JsonOut).declined).toEqual(["content.fstemplate"]);
  });
});

describe("music editor", () => {
  beforeEach(() => jest.clearAllMocks());
  const sameRights = (): Submission => ({ ...pending(), payload: { name: "Proposed", license: "WC", detail: { writer: "Someone" } } });

  it("shows up on /status with the pending count", async () => {
    const { controller } = editorController();
    expect(await controller.status(req(), res)).toEqual({ admin: false, musicEditor: true, pendingCount: 4 });
  });

  it("is matched by user id as well as email, and not when the list is empty", async () => {
    const { controller } = editorController();
    mockEnv.commonsMusicEditors = "editor00001";
    expect((await controller.status(req(), res) as JsonOut).musicEditor).toBe(true);
    mockEnv.commonsMusicEditors = "";
    expect(await controller.status(req(), res)).toEqual({ admin: false, musicEditor: false });
    expect(await controller.submissions(req(), res)).toEqual({ obj: {}, status: 401 });
  });

  it("can read the queue and a submission detail", async () => {
    const { controller } = editorController();
    expect(await controller.submissions(req(), res)).toEqual([]);
    const detail = await controller.submission(req(), res) as SubmissionDetail;
    expect(detail.id).toBe("sub00000001");
  });

  it("can approve, request changes and reject when the rights stand", async () => {
    const { controller } = editorController({ submission: { loadById: jest.fn(async () => sameRights()) } });
    expect(await controller.approve(req({ note: "proofread" }), res)).toEqual({ status: "approved", assetId: "asset000001", declined: [] });
    expect(PublishHelper.approve).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "editor00001", "proofread", []);
    expect(await controller.requestChanges(req({ note: "bar 12 is wrong" }), res)).toEqual({ status: "draft" });
    expect(await controller.reject(req({ reason: "quality", note: "unreadable" }), res)).toEqual({ status: "rejected" });
  });

  it.each([
    ["license", { name: "Proposed", license: "CC-BY", detail: {} }, []],
    ["proAnswer", { name: "Proposed", license: "WC", detail: { proAnswer: "Yes, GEMA" } }, []],
    ["recordingOwned", { name: "Proposed", license: "WC", detail: { recordingOwned: true } }, []],
    ["demoAudio.mp3", { name: "Proposed", license: "WC", detail: {} }, [{ name: "demoAudio.mp3", action: "add" }]]
  ])("gets a 403 when the proposal changes rights (%s)", async (what, payload, files) => {
    const { controller } = editorController({
      submission: { loadById: jest.fn(async () => ({ ...pending(), payload })) },
      assetFile: { loadBySubmission: jest.fn(async () => files) }
    });
    const out = await controller.approve(req({}), res) as JsonOut;
    expect(out.status).toBe(403);
    expect(out.obj.errors[0]).toContain("Rights changes need a server admin");
    expect(out.obj.errors[0]).toContain(what);
    expect(PublishHelper.approve).not.toHaveBeenCalled();
  });

  it("cannot approve a brand-new asset, whose license is being set for the first time", async () => {
    const { controller } = editorController({ asset: { loadById: jest.fn(async () => ({ id: "asset000001", assetType: "song", status: "pending", publisherUserId: "user0000001" })) } });
    const out = await controller.approve(req({}), res) as JsonOut;
    expect(out.status).toBe(403);
  });

  it("gets a 403 on reports, feature, remove and the other admin-only routes", async () => {
    const { controller } = editorController();
    for (const call of [
      () => controller.reports(req(), res),
      () => controller.claim(req({}, "rep00000001"), res),
      () => controller.resolve(req({ resolution: "dismissed", action: "none" }, "rep00000001"), res),
      () => controller.assets(req(), res),
      () => controller.unpublish(req({}, "asset000001"), res),
      () => controller.republish(req({}, "asset000001"), res),
      () => controller.remove(req({ reason: "policy" }, "asset000001"), res),
      () => controller.feature(req({}, "asset000001"), res),
      () => controller.scoreMissing(req(), res),
      () => controller.syncAudio(req(), res)
    ]) {
      const out = await call() as JsonOut;
      expect(out.status).toBe(403);
      expect(out.obj.errors).toEqual(["Server admin required"]);
    }
    expect(PublishHelper.remove).not.toHaveBeenCalled();
  });

  it("sync-audio registers titled stems zips listed in the package audio folder", async () => {
    const { ContentLibraryHelper } = require("../helpers/index");
    ContentLibraryHelper.listLiveKeys.mockResolvedValueOnce(["God's Love Outpoured-God's Love Outpoured-D-112.00bpm.zip"]);
    const create = jest.fn(async (f: AssetFile) => f);
    const { controller } = adminController({
      song: { loadPublishedSummaries: jest.fn(async () => [{ id: "0iO4XfQPq7T" }]) },
      assetFile: {
        loadLiveMany: jest.fn(async () => ({
          "0iO4XfQPq7T": [
            { name: "songs/en/gods-love-outpoured-0iO4XfQPq7T/masters/song.json" },
            { name: "songs/en/gods-love-outpoured-0iO4XfQPq7T/output/audio.zip" }
          ]
        })),
        create
      }
    });
    expect(await controller.syncAudio(req(), res)).toEqual({ scanned: 1, added: 1 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      assetId: "0iO4XfQPq7T",
      name: "songs/en/gods-love-outpoured-0iO4XfQPq7T/output/audio/God's Love Outpoured-God's Love Outpoured-D-112.00bpm.zip",
      action: "add"
    }));
  });

  it("server admins are unaffected by the rights check", async () => {
    mockEnv.commonsMusicEditors = "editor@example.com";
    const { controller } = adminController({ submission: { loadById: jest.fn(async () => ({ ...pending(), payload: { name: "Proposed", license: "CC-BY" } })) } });
    expect(await controller.approve(req({}), res)).toEqual({ status: "approved", assetId: "asset000001", declined: [] });
  });
});

describe("admin reports and assets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("claim moves open → reviewing only", async () => {
    const { controller, repos } = adminController();
    expect(await controller.claim(req({}, "rep00000001"), res)).toEqual({ status: "reviewing" });
    expect(repos.report.update).toHaveBeenCalledWith("rep00000001", { status: "reviewing", reviewedBy: "admin000001" });
    repos.report.loadById.mockResolvedValueOnce({ id: "rep00000001", status: "resolved" });
    expect((await controller.claim(req({}, "rep00000001"), res) as JsonOut).status).toBe(400);
  });

  it("an upheld copyright report with action=remove takes the asset down with the copyright reason", async () => {
    const { controller, repos } = adminController();
    expect(await controller.resolve(req({ resolution: "upheld", note: "confirmed", action: "remove" }, "rep00000001"), res)).toEqual({ status: "resolved" });
    expect(PublishHelper.remove).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "asset000001" }), "copyright");
    expect(repos.report.update).toHaveBeenCalledWith("rep00000001", expect.objectContaining({ status: "resolved", resolution: "upheld", resolutionNote: "confirmed" }));
  });

  it("emails the publisher and the reporter when a report takes the song down", async () => {
    const { controller, repos } = adminController({ report: { loadById: jest.fn(async () => ({ id: "rep00000001", assetId: "asset000001", reason: "copyright", status: "open", email: "reporter@example.com" })) } });
    await controller.resolve(req({ resolution: "upheld", note: "confirmed", action: "unpublish" }, "rep00000001"), res);
    expect(repos.asset.update).toHaveBeenCalledWith("asset000001", expect.objectContaining({ status: "unpublished" }));
    expect(notifyTakedown).toHaveBeenCalledWith(expect.objectContaining({ id: "asset000001" }), expect.objectContaining({ id: "rep00000001" }), ["owner000001"]);
    expect(notifyReportResolved).toHaveBeenCalledWith(expect.objectContaining({ email: "reporter@example.com", resolutionNote: "confirmed" }), "upheld");
  });

  it("emails only the reporter when nothing is taken down", async () => {
    const { controller } = adminController();
    await controller.resolve(req({ resolution: "dismissed", note: "no issue", action: "none" }, "rep00000001"), res);
    expect(notifyTakedown).not.toHaveBeenCalled();
    expect(notifyReportResolved).toHaveBeenCalledWith(expect.objectContaining({ resolutionNote: "no issue" }), "dismissed");
  });

  it("sends nothing when the resolution is refused", async () => {
    const { controller } = adminController();
    expect((await controller.resolve(req({ resolution: "maybe", action: "none" }, "rep00000001"), res) as JsonOut).status).toBe(400);
    expect(notifyReportResolved).not.toHaveBeenCalled();
    expect(notifyTakedown).not.toHaveBeenCalled();
  });

  it("dismissed with action=none leaves the asset alone; unknown resolutions are refused", async () => {
    const { controller, repos } = adminController();
    await controller.resolve(req({ resolution: "dismissed", note: "no issue", action: "none" }, "rep00000001"), res);
    expect(PublishHelper.remove).not.toHaveBeenCalled();
    expect(repos.asset.update).not.toHaveBeenCalled();
    expect((await controller.resolve(req({ resolution: "maybe", action: "none" }, "rep00000001"), res) as JsonOut).status).toBe(400);
  });

  it("replaces an asset's publishers, primary first, and resyncs everyone whose counts moved", async () => {
    const { controller, repos } = adminController();
    const out = await controller.setPublishers(req({ userIds: ["user0000001", "owner000001", "user0000001"] }, "asset000001"), res) as { publishers: { id: string; name: string }[] };
    expect(repos.asset.setPublishers).toHaveBeenCalledWith("asset000001", ["user0000001", "owner000001"], "admin000001");
    expect(out.publishers).toEqual([{ id: "user0000001", name: "Sub Mitter" }, { id: "owner000001", name: "Ow Ner" }]);
    expect(CommonsMauticHelper.syncWriter).toHaveBeenCalledTimes(2);
  });

  it("refuses bad publisher lists and non-admins", async () => {
    const { controller, repos } = adminController();
    expect((await controller.setPublishers(req({ userIds: "owner000001" }, "asset000001"), res) as JsonOut).status).toBe(400);
    expect((await controller.setPublishers(req({ userIds: ["x'; drop"] }, "asset000001"), res) as JsonOut).status).toBe(400);
    const { controller: visitor } = adminController({}, false);
    expect(await visitor.setPublishers(req({ userIds: [] }, "asset000001"), res)).toEqual({ obj: {}, status: 401 });
    expect(repos.asset.setPublishers).not.toHaveBeenCalled();
  });

  it("does not badge a co-publisher's edit as third-party", async () => {
    const { controller } = adminController({ asset: { loadPublisherIds: jest.fn(async () => ["owner000001", "user0000001"]) } });
    expect(((await controller.submission(req(), res)) as SubmissionDetail).isThirdParty).toBe(false);
  });

  it("unpublish/republish/remove follow the visibility state machine", async () => {
    const { controller, repos } = adminController();
    expect(await controller.unpublish(req({}, "asset000001"), res)).toEqual({ status: "unpublished" });
    expect(repos.asset.update).toHaveBeenCalledWith("asset000001", expect.objectContaining({ status: "unpublished", removedReason: "policy" }));
    expect((await controller.republish(req({}, "asset000001"), res) as JsonOut).status).toBe(400);
    expect((await controller.remove(req({ reason: "meh" }, "asset000001"), res) as JsonOut).status).toBe(400);
    expect(await controller.remove(req({ reason: "policy" }, "asset000001"), res)).toEqual({ status: "removed" });
    expect(PublishHelper.remove).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "asset000001" }), "policy");
  });
  it("never flags an edit to an already-published asset as a duplicate", async () => {
    const { controller } = adminController({
      submission: { loadQueue: jest.fn(async () => [{ ...pending(), publishedSubmissionId: "sub000000009", assetType: "song", assetName: "Old Rugged Cross", payload: { name: "Old Rugged Cross" } }]) },
      song: { loadPublishedForDuplicates: jest.fn(async () => [{ id: "song00000001", title: "Old Rugged Cross", writer: "George Bennard", chordPro: "" }]) }
    });
    const rows = await controller.submissions(req(), res) as QueueOut[];
    expect(rows[0].isNewAsset).toBe(false);
    expect(rows[0].possibleDuplicate).toBe(false);
  });
});
