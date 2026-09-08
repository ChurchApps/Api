import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
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
    fileUrls: () => ({})
  },
  ReviewerHelper: jest.requireActual("../helpers/ReviewerHelper").ReviewerHelper,
  PublishHelper: {
    approve: jest.fn(async () => {}),
    reject: jest.fn(async () => {}),
    requestChanges: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
    editablePayload: jest.fn(async () => ({ name: "Live", license: "WC", detail: {} })),
    diffFields: jest.fn(() => [{ key: "name", from: "Live", to: "Proposed" }]),
    fileSummary: (files: any[]) => files.map((f) => ({ name: f.name, action: f.action, role: f.name }))
  },
  QualityHelper: { score: jest.fn(async () => ({})) },
  userNames: jest.fn(async () => ({ user0000001: "Sub Mitter", owner000001: "Ow Ner" }))
}));

import { CommonsAdminController } from "../controllers/CommonsAdminController.js";
import { PublishHelper } from "../helpers/index.js";

const pending = (): any => ({ id: "sub00000001", assetId: "asset000001", submittedBy: "user0000001", status: "pending", type: "correction", payload: { name: "Proposed" } });

function adminController(overrides: any = {}, admin = true, au: any = { id: "admin000001", email: "admin@example.com", checkAccess: () => admin }) {
  const repos: any = {
    submission: { loadById: jest.fn(async () => pending()), loadQueue: jest.fn(async () => []), loadMine: jest.fn(async () => []), countSubmitterStats: jest.fn(async () => ({ total: 3, approved: 2 })), countByStatus: jest.fn(async () => 4) },
    asset: { loadById: jest.fn(async () => ({ id: "asset000001", assetType: "song", name: "Live", status: "published", publisherUserId: "owner000001", publishedSubmissionId: "sub00000000" })), update: jest.fn(async () => {}), loadByIds: jest.fn(async () => []), loadByPublisher: jest.fn(async () => []) },
    assetFile: { loadBySubmission: jest.fn(async () => [{ name: "tune.abc", action: "add" }]), loadLive: jest.fn(async () => []) },
    report: { loadById: jest.fn(async () => ({ id: "rep00000001", assetId: "asset000001", reason: "copyright", status: "open" })), update: jest.fn(async () => {}), loadAll: jest.fn(async () => []) },
    song: { loadPublishedForDuplicates: jest.fn(async () => []), loadSatellite: jest.fn(async () => ({ assetId: "asset000001", contributors: JSON.stringify([{ name: "Ada", what: "new song", submissionId: "sub00000000" }]) })) }
  };
  for (const [k, v] of Object.entries(overrides)) Object.assign(repos[k], v);
  const controller = new CommonsAdminController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

const req = (body: any = {}, id = "sub00000001", query: any = {}) => ({ params: { id }, body, query, headers: {} } as any);

/** A signed-in user listed in COMMONS_MUSIC_EDITORS by email, with no Server/Admin permission. */
function editorController(overrides: any = {}) {
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
    expect(await controller.status(req(), {} as any)).toEqual({ admin: true, musicEditor: false, pendingCount: 4 });
    expect(repos.submission.countByStatus).toHaveBeenCalledWith("pending");
    const { controller: visitor } = adminController({}, false);
    expect(await visitor.status(req(), {} as any)).toEqual({ admin: false, musicEditor: false });
  });

  it("gates everything on Server/Admin", async () => {
    const { controller } = adminController({}, false);
    expect(await controller.submissions(req(), {} as any)).toEqual({ obj: {}, status: 401 });
    expect(await controller.approve(req(), {} as any)).toEqual({ obj: {}, status: 401 });
    expect(await controller.remove(req({ reason: "policy" }), {} as any)).toEqual({ obj: {}, status: 401 });
  });

  it("approves a pending submission through PublishHelper", async () => {
    const { controller } = adminController();
    expect(await controller.approve(req({ note: "ok" }), {} as any)).toEqual({ status: "approved", assetId: "asset000001", declined: [] });
    expect(PublishHelper.approve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "sub00000001" }), expect.objectContaining({ id: "asset000001" }), "admin000001", "ok", []);
  });

  it("refuses to approve anything not pending or whose asset was removed", async () => {
    const { controller, repos } = adminController({ submission: { loadById: jest.fn(async () => ({ ...pending(), status: "approved" })) } });
    expect((await controller.approve(req(), {} as any) as any).status).toBe(400);
    repos.submission.loadById.mockResolvedValueOnce(pending());
    repos.asset.loadById.mockResolvedValueOnce({ id: "asset000001", status: "removed" });
    expect((await controller.approve(req(), {} as any) as any).status).toBe(400);
    expect(PublishHelper.approve).not.toHaveBeenCalled();
  });

  it("rejection needs a known reason and a note the submitter can learn from", async () => {
    const { controller } = adminController();
    expect((await controller.reject(req({ reason: "quality" }), {} as any) as any).status).toBe(400);
    expect((await controller.reject(req({ reason: "meh", note: "x" }), {} as any) as any).status).toBe(400);
    expect(await controller.reject(req({ reason: "quality", note: "needs a bridge" }), {} as any)).toEqual({ status: "rejected" });
    expect(PublishHelper.reject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "sub00000001" }), expect.objectContaining({ id: "asset000001" }), "admin000001", "quality", "needs a bridge");
  });

  it("accepts ccli as a reject reason", async () => {
    const { controller } = adminController();
    expect(await controller.reject(req({ reason: "ccli", note: "in the CCLI catalog" }), {} as any)).toEqual({ status: "rejected" });
    expect(PublishHelper.reject).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "sub00000001" }), expect.objectContaining({ id: "asset000001" }), "admin000001", "ccli", "in the CCLI catalog");
  });

  it("detail carries the diff, signed pending urls, third-party badge and a token-bearing preview url", async () => {
    const { controller } = adminController();
    const detail: any = await controller.submission(req(), {} as any);
    expect(detail.isThirdParty).toBe(true);
    expect(detail.isNewAsset).toBe(false);
    expect(detail.files[0].url).toBe("signed:sub00000001/tune.abc");
    expect(detail.diff.fields).toEqual([{ key: "name", from: "Live", to: "Proposed" }]);
    expect(detail.previewUrl).toBe("http://localhost:3104/preview/submission/sub00000001?token=tok");
    expect(detail.submittedByName).toBe("Sub Mitter");
    expect(detail.detailFields?.some((f: any) => f.key === "chordPro")).toBe(true);
  });

  it("carries the proposal type on the queue and the detail, and the song's contributors on the detail", async () => {
    const { controller } = adminController({ submission: { loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song" }]) } });
    const rows: any = await controller.submissions(req(), {} as any);
    expect(rows[0].type).toBe("correction");
    const detail: any = await controller.submission(req(), {} as any);
    expect(detail.type).toBe("correction");
    expect(detail.live.contributors).toEqual([{ name: "Ada", what: "new song", submissionId: "sub00000000" }]);
    expect(detail.detailFields.map((f: any) => f.key)).toEqual(expect.arrayContaining(["parentSongId", "relationLabel", "translator", "arranger"]));
  });

  it("exposes qualityDetail from the payload on the queue and detail, without leaking payload on the queue", async () => {
    const qualityDetail = { heuristic: 26, parts: ["demo", "scripture", "themes"], llm: 0, notes: "completeness heuristic only — not an AI judgment" };
    const { controller, repos } = adminController({
      submission: {
        loadById: jest.fn(async () => ({ ...pending(), payload: { name: "Proposed", qualityDetail } })),
        loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song", payload: { name: "Proposed", qualityDetail } }])
      }
    });
    const rows: any = await controller.submissions(req(), {} as any);
    expect(rows[0].qualityDetail).toEqual(qualityDetail);
    expect(rows[0].payload).toBeUndefined();
    expect(rows[0].rightsFlag).toBe(false);
    expect(rows[0].possibleDuplicate).toBe(false);
    repos.submission.loadById.mockResolvedValueOnce({ ...pending(), payload: { name: "Proposed", qualityDetail } });
    const detail: any = await controller.submission(req(), {} as any);
    expect(detail.qualityDetail).toEqual(qualityDetail);
  });

  it("flags GEMA/PRS/publisher answers on the queue without leaking payload", async () => {
    const { controller } = adminController({ submission: { loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song", payload: { name: "Proposed", detail: { proAnswer: "Yes — registered with GEMA" } } }]) } });
    const rows: any = await controller.submissions(req(), {} as any);
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
    const rows: any = await controller.submissions(req(), {} as any);
    expect(rows[0].possibleDuplicate).toBe(true);
    expect(rows[0].payload).toBeUndefined();
  });

  it("flags a duplicate of a published song nobody in this submitter's history wrote", async () => {
    const { controller } = adminController({
      submission: { loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song", assetName: "The Old Rugged Cross", payload: { name: "The Old Rugged Cross", detail: { writer: "A Newcomer" } } }]) },
      song: { loadPublishedForDuplicates: jest.fn(async () => [{ id: "asset000555", title: "Old Rugged Cross", writer: "George Bennard", chordPro: "" }]) }
    });
    const rows: any = await controller.submissions(req(), {} as any);
    expect(rows[0].possibleDuplicate).toBe(true);
  });

  it("flags a published song whose first sung line matches, even under a different title", async () => {
    const { controller } = adminController({
      submission: { loadQueue: jest.fn(async () => [{ ...pending(), assetType: "song", assetName: "Grace Astounding", payload: { name: "Grace Astounding", detail: { chordPro: "Verse 1\n[G]Amazing grace! how [C]sweet the [G]sound," } } }]) },
      song: { loadPublishedForDuplicates: jest.fn(async () => [{ id: "asset000556", title: "Amazing Grace", writer: "John Newton", chordPro: "{title: Amazing Grace}\n\nVerse 1\nAmazing grace! how sweet the sound," }]) }
    });
    const rows: any = await controller.submissions(req(), {} as any);
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
    const rows: any = await controller.submissions(req(), {} as any);
    expect(rows[0].possibleDuplicate).toBe(false);
  });
});

describe("request changes", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends a pending submission back to draft with the note", async () => {
    const { controller } = adminController();
    expect(await controller.requestChanges(req({ note: "  Please add the bridge chords.  " }), {} as any)).toEqual({ status: "draft" });
    expect(PublishHelper.requestChanges).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "sub00000001" }), "admin000001", "Please add the bridge chords.");
  });

  it("needs a note and clips it to 500 characters", async () => {
    const { controller } = adminController();
    expect((await controller.requestChanges(req({}), {} as any) as any).status).toBe(400);
    expect((await controller.requestChanges(req({ note: "   " }), {} as any) as any).status).toBe(400);
    await controller.requestChanges(req({ note: "x".repeat(600) }), {} as any);
    expect((PublishHelper.requestChanges as jest.Mock).mock.calls[0][3]).toHaveLength(500);
  });

  it("409s when the submission is not pending", async () => {
    const { controller } = adminController({ submission: { loadById: jest.fn(async () => ({ ...pending(), status: "draft" })) } });
    const out: any = await controller.requestChanges(req({ note: "again" }), {} as any);
    expect(out.status).toBe(409);
    expect(PublishHelper.requestChanges).not.toHaveBeenCalled();
  });

  it("404s an unknown submission and 401s a non-reviewer", async () => {
    const { controller } = adminController({ submission: { loadById: jest.fn(async () => undefined) } });
    expect((await controller.requestChanges(req({ note: "x" }), {} as any) as any).status).toBe(404);
    const { controller: visitor } = adminController({}, false);
    expect(await visitor.requestChanges(req({ note: "x" }), {} as any)).toEqual({ obj: {}, status: 401 });
  });
});

describe("partial approve", () => {
  beforeEach(() => jest.clearAllMocks());
  const proposed = [{ name: "lyrics.chordpro", action: "replace" }, { name: "demoAudio.mp3", action: "add" }, { name: "sheetPdf.pdf", action: "add" }];

  it("passes validated declines through to PublishHelper and echoes them", async () => {
    const { controller } = adminController({ assetFile: { loadBySubmission: jest.fn(async () => proposed), loadLive: jest.fn(async () => [{ name: "lyrics.chordpro" }]) } });
    const out = await controller.approve(req({ note: "score is good", declineFiles: [{ name: "sheetPdf.pdf", reason: " blurry scan " }] }), {} as any);
    expect(out).toEqual({ status: "approved", assetId: "asset000001", declined: ["sheetPdf.pdf"] });
    expect(PublishHelper.approve).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "admin000001", "score is good", [{ name: "sheetPdf.pdf", reason: "blurry scan" }]);
  });

  it("refuses names outside the proposal, missing reasons, duplicates and a non-list body", async () => {
    const { controller } = adminController({ assetFile: { loadBySubmission: jest.fn(async () => proposed), loadLive: jest.fn(async () => []) } });
    for (const declineFiles of [
      [{ name: "cover.webp", reason: "x" }],
      [{ name: "sheetPdf.pdf" }],
      [{ name: "sheetPdf.pdf", reason: "a" }, { name: "sheetPdf.pdf", reason: "b" }],
      "sheetPdf.pdf"
    ]) {
      const out: any = await controller.approve(req({ declineFiles }), {} as any);
      expect(out.status).toBe(400);
    }
    expect(PublishHelper.approve).not.toHaveBeenCalled();
  });

  it("only lets a required file be declined when the live asset still has one", async () => {
    const template = { id: "asset000001", assetType: "freeshow/template", name: "Wide", status: "published", publisherUserId: "owner000001", publishedSubmissionId: "sub00000000" };
    const files = [{ name: "content.fstemplate", action: "replace" }];
    const decline = { declineFiles: [{ name: "content.fstemplate", reason: "keep the old one" }] };
    const { controller, repos } = adminController({ asset: { loadById: jest.fn(async () => template) }, assetFile: { loadBySubmission: jest.fn(async () => files), loadLive: jest.fn(async () => []) } });
    expect((await controller.approve(req(decline), {} as any) as any).status).toBe(400);
    repos.assetFile.loadLive.mockResolvedValueOnce([{ name: "content.fstemplate" }]);
    expect((await controller.approve(req(decline), {} as any) as any).declined).toEqual(["content.fstemplate"]);
  });
});

describe("music editor", () => {
  beforeEach(() => jest.clearAllMocks());
  const sameRights = (): any => ({ ...pending(), payload: { name: "Proposed", license: "WC", detail: { writer: "Someone" } } });

  it("shows up on /status with the pending count", async () => {
    const { controller } = editorController();
    expect(await controller.status(req(), {} as any)).toEqual({ admin: false, musicEditor: true, pendingCount: 4 });
  });

  it("is matched by user id as well as email, and not when the list is empty", async () => {
    const { controller } = editorController();
    mockEnv.commonsMusicEditors = "editor00001";
    expect((await controller.status(req(), {} as any) as any).musicEditor).toBe(true);
    mockEnv.commonsMusicEditors = "";
    expect(await controller.status(req(), {} as any)).toEqual({ admin: false, musicEditor: false });
    expect(await controller.submissions(req(), {} as any)).toEqual({ obj: {}, status: 401 });
  });

  it("can read the queue and a submission detail", async () => {
    const { controller } = editorController();
    expect(await controller.submissions(req(), {} as any)).toEqual([]);
    const detail: any = await controller.submission(req(), {} as any);
    expect(detail.id).toBe("sub00000001");
  });

  it("can approve, request changes and reject when the rights stand", async () => {
    const { controller } = editorController({ submission: { loadById: jest.fn(async () => sameRights()) } });
    expect(await controller.approve(req({ note: "proofread" }), {} as any)).toEqual({ status: "approved", assetId: "asset000001", declined: [] });
    expect(PublishHelper.approve).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "editor00001", "proofread", []);
    expect(await controller.requestChanges(req({ note: "bar 12 is wrong" }), {} as any)).toEqual({ status: "draft" });
    expect(await controller.reject(req({ reason: "quality", note: "unreadable" }), {} as any)).toEqual({ status: "rejected" });
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
    const out: any = await controller.approve(req({}), {} as any);
    expect(out.status).toBe(403);
    expect(out.obj.errors[0]).toContain("Rights changes need a server admin");
    expect(out.obj.errors[0]).toContain(what);
    expect(PublishHelper.approve).not.toHaveBeenCalled();
  });

  it("cannot approve a brand-new asset, whose license is being set for the first time", async () => {
    const { controller } = editorController({ asset: { loadById: jest.fn(async () => ({ id: "asset000001", assetType: "song", status: "pending", publisherUserId: "user0000001" })) } });
    const out: any = await controller.approve(req({}), {} as any);
    expect(out.status).toBe(403);
  });

  it("gets a 403 on reports, feature, remove and the other admin-only routes", async () => {
    const { controller } = editorController();
    for (const call of [
      () => controller.reports(req(), {} as any),
      () => controller.claim(req({}, "rep00000001"), {} as any),
      () => controller.resolve(req({ resolution: "dismissed", action: "none" }, "rep00000001"), {} as any),
      () => controller.assets(req(), {} as any),
      () => controller.unpublish(req({}, "asset000001"), {} as any),
      () => controller.republish(req({}, "asset000001"), {} as any),
      () => controller.remove(req({ reason: "policy" }, "asset000001"), {} as any),
      () => controller.feature(req({}, "asset000001"), {} as any),
      () => controller.scoreMissing(req(), {} as any)
    ]) {
      const out: any = await call();
      expect(out.status).toBe(403);
      expect(out.obj.errors).toEqual(["Server admin required"]);
    }
    expect(PublishHelper.remove).not.toHaveBeenCalled();
  });

  it("server admins are unaffected by the rights check", async () => {
    mockEnv.commonsMusicEditors = "editor@example.com";
    const { controller } = adminController({ submission: { loadById: jest.fn(async () => ({ ...pending(), payload: { name: "Proposed", license: "CC-BY" } })) } });
    expect(await controller.approve(req({}), {} as any)).toEqual({ status: "approved", assetId: "asset000001", declined: [] });
  });
});

describe("admin reports and assets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("claim moves open → reviewing only", async () => {
    const { controller, repos } = adminController();
    expect(await controller.claim(req({}, "rep00000001"), {} as any)).toEqual({ status: "reviewing" });
    expect(repos.report.update).toHaveBeenCalledWith("rep00000001", { status: "reviewing", reviewedBy: "admin000001" });
    repos.report.loadById.mockResolvedValueOnce({ id: "rep00000001", status: "resolved" });
    expect((await controller.claim(req({}, "rep00000001"), {} as any) as any).status).toBe(400);
  });

  it("an upheld copyright report with action=remove takes the asset down with the copyright reason", async () => {
    const { controller, repos } = adminController();
    expect(await controller.resolve(req({ resolution: "upheld", note: "confirmed", action: "remove" }, "rep00000001"), {} as any)).toEqual({ status: "resolved" });
    expect(PublishHelper.remove).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "asset000001" }), "copyright");
    expect(repos.report.update).toHaveBeenCalledWith("rep00000001", expect.objectContaining({ status: "resolved", resolution: "upheld", resolutionNote: "confirmed" }));
  });

  it("emails the publisher and the reporter when a report takes the song down", async () => {
    const { controller, repos } = adminController({ report: { loadById: jest.fn(async () => ({ id: "rep00000001", assetId: "asset000001", reason: "copyright", status: "open", email: "reporter@example.com" })) } });
    await controller.resolve(req({ resolution: "upheld", note: "confirmed", action: "unpublish" }, "rep00000001"), {} as any);
    expect(repos.asset.update).toHaveBeenCalledWith("asset000001", expect.objectContaining({ status: "unpublished" }));
    expect(notifyTakedown).toHaveBeenCalledWith(expect.objectContaining({ id: "asset000001" }), expect.objectContaining({ id: "rep00000001" }));
    expect(notifyReportResolved).toHaveBeenCalledWith(expect.objectContaining({ email: "reporter@example.com", resolutionNote: "confirmed" }), "upheld");
  });

  it("emails only the reporter when nothing is taken down", async () => {
    const { controller } = adminController();
    await controller.resolve(req({ resolution: "dismissed", note: "no issue", action: "none" }, "rep00000001"), {} as any);
    expect(notifyTakedown).not.toHaveBeenCalled();
    expect(notifyReportResolved).toHaveBeenCalledWith(expect.objectContaining({ resolutionNote: "no issue" }), "dismissed");
  });

  it("sends nothing when the resolution is refused", async () => {
    const { controller } = adminController();
    expect((await controller.resolve(req({ resolution: "maybe", action: "none" }, "rep00000001"), {} as any) as any).status).toBe(400);
    expect(notifyReportResolved).not.toHaveBeenCalled();
    expect(notifyTakedown).not.toHaveBeenCalled();
  });

  it("dismissed with action=none leaves the asset alone; unknown resolutions are refused", async () => {
    const { controller, repos } = adminController();
    await controller.resolve(req({ resolution: "dismissed", note: "no issue", action: "none" }, "rep00000001"), {} as any);
    expect(PublishHelper.remove).not.toHaveBeenCalled();
    expect(repos.asset.update).not.toHaveBeenCalled();
    expect((await controller.resolve(req({ resolution: "maybe", action: "none" }, "rep00000001"), {} as any) as any).status).toBe(400);
  });

  it("unpublish/republish/remove follow the visibility state machine", async () => {
    const { controller, repos } = adminController();
    expect(await controller.unpublish(req({}, "asset000001"), {} as any)).toEqual({ status: "unpublished" });
    expect(repos.asset.update).toHaveBeenCalledWith("asset000001", expect.objectContaining({ status: "unpublished", removedReason: "policy" }));
    expect((await controller.republish(req({}, "asset000001"), {} as any) as any).status).toBe(400);
    expect((await controller.remove(req({ reason: "meh" }, "asset000001"), {} as any) as any).status).toBe(400);
    expect(await controller.remove(req({ reason: "policy" }, "asset000001"), {} as any)).toEqual({ status: "removed" });
    expect(PublishHelper.remove).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "asset000001" }), "policy");
  });
});
