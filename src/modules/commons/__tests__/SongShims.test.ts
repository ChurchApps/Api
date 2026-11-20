import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../controllers/CommonsBaseController", () => ({
  CommonsBaseController: class {
    declare actionWrapper: ActionWrapper;
    json(obj: unknown, status: number) { return { obj, status }; }
    actionWrapperAnon(_req: unknown, _res: unknown, fn: () => Promise<unknown>) { return fn(); }
    // stands in for BaseController.actionWrapperAuth; the real one is covered in BaseControllerAuth.test.ts
    actionWrapperAuth(req: express.Request, res: express.Response, fn: (au: ShimUser) => Promise<unknown>) {
      return this.actionWrapper(req, res, async (au: ShimUser) => (au?.id ? fn(au) : this.json({ errors: ["Sign in required"] }, 401)));
    }
  }
}));
jest.mock("../helpers/index", () => ({
  ChordProHelper: { slug: (t: string) => t, toCho: () => "cho", toLyrics: () => "txt" },
  ContentLibraryHelper: { fileUrls: () => ({}) },
  parseContributors: jest.requireActual("../helpers/ContributorsHelper").parseContributors,
  recordAssetDownload: jest.fn(async () => 7),
  PublishHelper: { discardProposed: jest.fn(async () => {}) },
  // the real one reads Environment; here a reviewer is whoever passes the server-admin check
  ReviewerHelper: { canReview: (au: ShimUser) => !!au?.id && au.checkAccess() },
  isServerAdmin: jest.fn(async () => false),
  SubmissionHelper: {
    createDraft: jest.fn(async (_r: Repos, _au: Actor, body: { assetId?: string; payload?: SubmissionPayload }) => ({ ok: true, value: { submission: { id: "sub00000001", status: "draft" }, asset: { id: body.assetId || "asset000001", assetType: "song", name: body.payload?.name } } })),
    storeInline: jest.fn(async () => ({ ok: true, value: {} })),
    submit: jest.fn(async () => ({ ok: true, value: { status: "pending" } }))
  }
}));

import type express from "express";
import { CommonsSongController } from "../controllers/CommonsSongController.js";
import { PublishHelper, SubmissionHelper } from "../helpers/index.js";
import type { Actor } from "../helpers/index.js";
import type { Asset, AssetFile, SongView, SubmissionPayload } from "../models/index.js";
import type { Repos } from "../repositories/index.js";

type ShimUser = { id?: string; churchId?: string; checkAccess: () => boolean };
type ActionWrapper = (req: express.Request, res: express.Response, action: (au: ShimUser) => Promise<unknown>) => Promise<unknown>;
type JsonOut = { obj: unknown; status: number };
type Row = Record<string, unknown>;
const req = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

function songController(signedIn = true) {
  const repos = {
    asset: { loadPublished: jest.fn(async (id: string): Promise<Asset> => ({ id, assetType: "song", status: "published" })), delete: jest.fn(async () => {}), isPublisher: jest.fn(async (a: Asset, u?: string) => !!u && a?.publisherUserId === u), loadPublisherIds: jest.fn(async (a: Asset) => [a?.publisherUserId].filter(Boolean)) },
    submission: { delete: jest.fn(async () => {}) },
    assetFile: { deleteBySubmission: jest.fn(async () => {}), loadLiveMany: jest.fn(async () => ({})), loadLive: jest.fn(async (): Promise<AssetFile[]> => []) },
    rating: { setSaved: jest.fn(async () => {}) },
    song: {
      loadById: jest.fn(async (): Promise<SongView> => ({ id: "asset000009", title: "Old Hymn", writer: "Anon", chordPro: "[C]x", license: "PD", language: "English", status: "published", rank: 71, qualityScore: 88, qualityDetail: "{}", proAnswer: "no", contributors: JSON.stringify([{ name: "Ada", what: "new song", submissionId: "sub00000000", at: "2026-01-01T00:00:00.000Z" }]) })),
      loadPublishedSummaries: jest.fn(async () => [{ id: "asset000009", title: "Old Hymn", rank: 71, qualityScore: 88 }]),
      loadBySubmitter: jest.fn(async () => [{ id: "asset000009", title: "Old Hymn", rank: 71, qualityScore: 88 }]),
      loadSaved: jest.fn(async () => [{ id: "asset000009", title: "Old Hymn", rank: 71, qualityScore: 88 }])
    }
  };
  const au: ShimUser = signedIn ? { id: "user0000001", churchId: "church00001", checkAccess: () => false } : { checkAccess: () => false };
  const controller = new CommonsSongController();
  const actionWrapper: ActionWrapper = (_req, _res, action) => action(au);
  Object.assign(controller, { repos, actionWrapper, json: (obj: unknown, status: number) => ({ obj, status }) });
  return { controller, repos };
}

describe("legacy song shims", () => {
  beforeEach(() => jest.clearAllMocks());

  it("POST /songs becomes draft → inline files → submit and answers with the asset id", async () => {
    const { controller } = songController();
    const body = { title: "New Hymn", writer: "W", songKey: "G", chordPro: "Verse 1\n[G]Sing", certified: true, license: "PD", recordingOwned: true, files: { demoAudio: { name: "demo.wav", contentType: "audio/wav", base64: Buffer.from("RIFF").toString("base64") } } };
    const result = await controller.submit(req({ body }), res);
    expect(SubmissionHelper.createDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "user0000001" }), expect.objectContaining({ assetType: "song", payload: expect.objectContaining({ name: "New Hymn", license: "PD", detail: expect.objectContaining({ writer: "W", certified: true, recordingOwned: true }) }) }));
    expect(SubmissionHelper.storeInline).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "demoAudio.wav", "audio/wav", expect.any(Buffer), "user0000001");
    expect(SubmissionHelper.submit).toHaveBeenCalled();
    expect(result).toEqual({ id: "asset000001", submissionId: "sub00000001", title: "New Hymn", status: "pending" });
  });

  it("POST /songs passes the chosen license through unchanged so the registry, not the shim, decides what is uploadable", async () => {
    const { controller } = songController();
    for (const license of ["CC-BY", "CC-BY-NC"]) {
      await controller.submit(req({ body: { title: "CC Hymn", writer: "W", chordPro: "[G]x", certified: true, license } }), res);
      expect(SubmissionHelper.createDraft).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ payload: expect.objectContaining({ license }) }));
    }
    await controller.submit(req({ body: { title: "Default", writer: "W", chordPro: "[G]x", certified: true } }), res);
    expect(SubmissionHelper.createDraft).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ payload: expect.objectContaining({ license: "WC" }) }));
  });

  it("POST /songs cleans up the draft and asset when submit is refused", async () => {
    (SubmissionHelper.submit as jest.Mock).mockResolvedValueOnce({ ok: false, status: 400, error: "recordingOwned confirmation is required" });
    const { controller, repos } = songController();
    const result = (await controller.submit(req({ body: { title: "x", chordPro: "y", certified: true } }), res)) as JsonOut;
    expect(result.status).toBe(400);
    expect(PublishHelper.discardProposed).toHaveBeenCalledWith(repos, expect.objectContaining({ id: "sub00000001" }), expect.objectContaining({ id: "asset000001" }), true);
  });

  it("POST /songs discards the draft, asset and stored files when an inline file is refused", async () => {
    (SubmissionHelper.storeInline as jest.Mock).mockResolvedValueOnce({ ok: false, status: 400, error: "sheetPdf.exe is not accepted" });
    const { controller, repos } = songController();
    const result = (await controller.submit(req({ body: { title: "x", chordPro: "y", certified: true, files: { sheetPdf: { name: "a.exe", base64: "AA==", contentType: "x" } } } }), res)) as JsonOut;
    expect(result.status).toBe(400);
    expect(PublishHelper.discardProposed).toHaveBeenCalledWith(repos, expect.objectContaining({ id: "sub00000001" }), expect.objectContaining({ id: "asset000001" }), true);
    expect(SubmissionHelper.submit).not.toHaveBeenCalled();
  });

  it("POST /songs/:id/abc becomes a modification submission carrying tune.abc", async () => {
    const { controller } = songController();
    const result = await controller.submitAbc(req({ params: { id: "asset000009" }, body: { abc: "X:1\nK:C\nCDEF|" } }), res);
    expect(SubmissionHelper.createDraft).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ assetId: "asset000009", note: "ABC transcription of the tune", payload: expect.objectContaining({ name: "Old Hymn", type: "additionalFile" }) }));
    expect(SubmissionHelper.storeInline).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "tune.abc", "text/plain; charset=utf-8", expect.any(Buffer), "user0000001");
    expect(result).toEqual({ id: "sub00000001", status: "pending" });
  });

  it("POST /songs/:id/abc is refused before any draft when the license keeps changes with the writer", async () => {
    const { controller, repos } = songController();
    repos.asset.loadPublished.mockResolvedValueOnce({ id: "asset000009", assetType: "song", status: "published", license: "larry-holder", publisherUserId: "writer00001" });
    const result = (await controller.submitAbc(req({ params: { id: "asset000009" }, body: { abc: "X:1\nK:C\nCDEF|" } }), res)) as JsonOut;
    expect(result).toEqual({ obj: { errors: ["This song's license keeps all changes with the writer, so it does not accept proposed edits"] }, status: 403 });
    expect(SubmissionHelper.createDraft).not.toHaveBeenCalled();
    // the writer may still add their own transcription
    repos.asset.loadPublished.mockResolvedValueOnce({ id: "asset000009", assetType: "song", status: "published", license: "larry-holder", publisherUserId: "user0000001" });
    expect(await controller.submitAbc(req({ params: { id: "asset000009" }, body: { abc: "X:1\nK:C\nCDEF|" } }), res)).toEqual({ id: "sub00000001", status: "pending" });
  });

  it("POST /songs/:id/abc takes a reviewer's transcription on a song closed to community edits, carrying the license version", async () => {
    const { controller, repos } = songController();
    const actionWrapper: ActionWrapper = (_req, _res, action) => action({ id: "admin000001", checkAccess: () => true });
    Object.assign(controller, { actionWrapper });
    repos.asset.loadPublished.mockResolvedValueOnce({ id: "asset000009", assetType: "song", status: "published", license: "larry-holder", publisherUserId: null });
    repos.song.loadById.mockResolvedValueOnce({ id: "asset000009", title: "God Cares For You", writer: "Larry Holder", license: "larry-holder", licenseVersion: "permissions", status: "published" });
    expect(await controller.submitAbc(req({ params: { id: "asset000009" }, body: { abc: "X:1" } }), res)).toEqual({ id: "sub00000001", status: "pending" });
    expect(SubmissionHelper.createDraft).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ payload: expect.objectContaining({ license: "larry-holder", licenseVersion: "permissions" }) }));
    expect(SubmissionHelper.submit).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), { byReviewer: true });
  });

  it("library toggles write the saved flag on the caller's rating row", async () => {
    const { controller, repos } = songController();
    expect(await controller.addToLibrary(req({ params: { id: "asset000009" } }), res)).toEqual({ inLibrary: true });
    expect(await controller.removeFromLibrary(req({ params: { id: "asset000009" } }), res)).toEqual({ inLibrary: false });
    expect(repos.rating.setSaved).toHaveBeenCalledWith("asset000009", "user0000001", true);
    expect(repos.rating.setSaved).toHaveBeenCalledWith("asset000009", "user0000001", false);
  });

  it("the public list, mine and library payloads carry rank and never qualityScore", async () => {
    const { controller } = songController();
    const payloads = [await controller.getAll(req({}), res), await controller.mine(req({}), res), await controller.library(req({}), res)] as Row[][];
    for (const rows of payloads) {
      expect(rows).toHaveLength(1);
      expect(rows[0].rank).toBe(71);
      expect(rows[0]).not.toHaveProperty("qualityScore");
    }
  });

  it("GET /songs/:id carries rank and strips the reviewer-only fields", async () => {
    const { controller } = songController();
    const song = (await controller.get(req({ params: { id: "asset000009" } }), res)) as Row;
    expect(song.rank).toBe(71);
    expect(song.contributors).toEqual([{ name: "Ada", what: "new song", submissionId: "sub00000000", at: "2026-01-01T00:00:00.000Z" }]);
    expect(song).not.toHaveProperty("qualityScore");
    expect(song).not.toHaveProperty("qualityDetail");
    expect(song).not.toHaveProperty("proAnswer");
  });

  it("every shim requires a signed-in user", async () => {
    const { controller } = songController(false);
    expect((await controller.submit(req({ body: {} }), res) as JsonOut).status).toBe(401);
    expect((await controller.submitAbc(req({ params: { id: "x" }, body: {} }), res) as JsonOut).status).toBe(401);
    expect((await controller.addToLibrary(req({ params: { id: "x" } }), res) as JsonOut).status).toBe(401);
  });
});
