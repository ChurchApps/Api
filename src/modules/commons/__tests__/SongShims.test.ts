import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../controllers/CommonsBaseController", () => ({
  CommonsBaseController: class {
    json(obj: any, status: number) { return { obj, status }; }
    actionWrapperAnon(_req: any, _res: any, fn: any) { return fn(); }
    // stands in for BaseController.actionWrapperAuth; the real one is covered in BaseControllerAuth.test.ts
    actionWrapperAuth(req: any, res: any, fn: any) {
      return (this as any).actionWrapper(req, res, async (au: any) => (au?.id ? fn(au) : (this as any).json({ errors: ["Sign in required"] }, 401)));
    }
  }
}));
jest.mock("../helpers/index", () => ({
  ChordProHelper: { slug: (t: string) => t, toCho: () => "cho", toLyrics: () => "txt" },
  ContentLibraryHelper: { fileUrls: () => ({}) },
  recordAssetDownload: jest.fn(async () => 7),
  SubmissionHelper: {
    createDraft: jest.fn(async (_r: any, _au: any, body: any) => ({ ok: true, value: { submission: { id: "sub00000001", status: "draft" }, asset: { id: body.assetId || "asset000001", assetType: "song", name: body.payload?.name } } })),
    storeInline: jest.fn(async () => ({ ok: true, value: {} })),
    submit: jest.fn(async () => ({ ok: true, value: { status: "pending" } }))
  }
}));

import { CommonsSongController } from "../controllers/CommonsSongController.js";
import { SubmissionHelper } from "../helpers/index.js";

function songController(signedIn = true) {
  const repos: any = {
    asset: { loadPublished: jest.fn(async (id: string) => ({ id, assetType: "song", status: "published" })), delete: jest.fn(async () => {}) },
    submission: { delete: jest.fn(async () => {}) },
    assetFile: { deleteBySubmission: jest.fn(async () => {}), loadLiveMany: jest.fn(async () => ({})) },
    rating: { setSaved: jest.fn(async () => {}) },
    song: {
      loadById: jest.fn(async () => ({ id: "asset000009", title: "Old Hymn", writer: "Anon", chordPro: "[C]x", license: "PD", language: "English", status: "published", rank: 71, qualityScore: 88, qualityDetail: "{}", proAnswer: "no" })),
      loadPublishedSummaries: jest.fn(async () => [{ id: "asset000009", title: "Old Hymn", rank: 71, qualityScore: 88 }]),
      loadBySubmitter: jest.fn(async () => [{ id: "asset000009", title: "Old Hymn", rank: 71, qualityScore: 88 }]),
      loadSaved: jest.fn(async () => [{ id: "asset000009", title: "Old Hymn", rank: 71, qualityScore: 88 }])
    }
  };
  const au = signedIn ? { id: "user0000001", churchId: "church00001", checkAccess: () => false } : { checkAccess: () => false };
  const controller = new CommonsSongController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("legacy song shims", () => {
  beforeEach(() => jest.clearAllMocks());

  it("POST /songs becomes draft → inline files → submit and answers with the asset id", async () => {
    const { controller } = songController();
    const body = { title: "New Hymn", writer: "W", songKey: "G", chordPro: "Verse 1\n[G]Sing", certified: true, license: "PD", recordingOwned: true, files: { demoAudio: { name: "demo.wav", contentType: "audio/wav", base64: Buffer.from("RIFF").toString("base64") } } };
    const result = await controller.submit({ body } as any, {} as any);
    expect(SubmissionHelper.createDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "user0000001" }), expect.objectContaining({ assetType: "song", payload: expect.objectContaining({ name: "New Hymn", license: "PD", detail: expect.objectContaining({ writer: "W", certified: true, recordingOwned: true }) }) }));
    expect(SubmissionHelper.storeInline).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "demoAudio.wav", "audio/wav", expect.any(Buffer), "user0000001");
    expect(SubmissionHelper.submit).toHaveBeenCalled();
    expect(result).toEqual({ id: "asset000001", submissionId: "sub00000001", title: "New Hymn", status: "pending" });
  });

  it("POST /songs cleans up the draft and asset when submit is refused", async () => {
    (SubmissionHelper.submit as jest.Mock).mockResolvedValueOnce({ ok: false, status: 400, error: "recordingOwned confirmation is required" });
    const { controller, repos } = songController();
    const result: any = await controller.submit({ body: { title: "x", chordPro: "y", certified: true } } as any, {} as any);
    expect(result.status).toBe(400);
    expect(repos.submission.delete).toHaveBeenCalledWith("sub00000001");
    expect(repos.asset.delete).toHaveBeenCalledWith("asset000001");
  });

  it("POST /songs/:id/abc becomes a modification submission carrying tune.abc", async () => {
    const { controller } = songController();
    const result = await controller.submitAbc({ params: { id: "asset000009" }, body: { abc: "X:1\nK:C\nCDEF|" } } as any, {} as any);
    expect(SubmissionHelper.createDraft).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ assetId: "asset000009", note: "ABC transcription", payload: expect.objectContaining({ name: "Old Hymn" }) }));
    expect(SubmissionHelper.storeInline).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "tune.abc", "text/plain; charset=utf-8", expect.any(Buffer), "user0000001");
    expect(result).toEqual({ id: "sub00000001", status: "pending" });
  });

  it("library toggles write the saved flag on the caller's rating row", async () => {
    const { controller, repos } = songController();
    expect(await controller.addToLibrary({ params: { id: "asset000009" } } as any, {} as any)).toEqual({ inLibrary: true });
    expect(await controller.removeFromLibrary({ params: { id: "asset000009" } } as any, {} as any)).toEqual({ inLibrary: false });
    expect(repos.rating.setSaved).toHaveBeenCalledWith("asset000009", "user0000001", true);
    expect(repos.rating.setSaved).toHaveBeenCalledWith("asset000009", "user0000001", false);
  });

  it("the public list, mine and library payloads carry rank and never qualityScore", async () => {
    const { controller } = songController();
    const payloads: any[] = [await controller.getAll({} as any, {} as any), await controller.mine({} as any, {} as any), await controller.library({} as any, {} as any)];
    for (const rows of payloads) {
      expect(rows).toHaveLength(1);
      expect(rows[0].rank).toBe(71);
      expect(rows[0]).not.toHaveProperty("qualityScore");
    }
  });

  it("GET /songs/:id carries rank and strips the reviewer-only fields", async () => {
    const { controller } = songController();
    const song: any = await controller.get({ params: { id: "asset000009" } } as any, {} as any);
    expect(song.rank).toBe(71);
    expect(song).not.toHaveProperty("qualityScore");
    expect(song).not.toHaveProperty("qualityDetail");
    expect(song).not.toHaveProperty("proAnswer");
  });

  it("every shim requires a signed-in user", async () => {
    const { controller } = songController(false);
    expect((await controller.submit({ body: {} } as any, {} as any) as any).status).toBe(401);
    expect((await controller.submitAbc({ params: { id: "x" }, body: {} } as any, {} as any) as any).status).toBe(401);
    expect((await controller.addToLibrary({ params: { id: "x" } } as any, {} as any) as any).status).toBe(401);
  });
});
