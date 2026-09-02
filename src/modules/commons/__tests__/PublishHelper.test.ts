import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../helpers/ContentLibraryHelper", () => ({
  ContentLibraryHelper: {
    livePrefix: (a: any) => `commons/assets/${a.assetType}/${a.id}`,
    liveKey: (a: any, n: string) => `commons/assets/${a.assetType}/${a.id}/${n}`,
    pendingPrefix: (id: string) => `commons/pending/${id}`,
    pendingKey: (id: string, n: string) => `commons/pending/${id}/${n}`,
    promote: jest.fn(async () => true),
    store: jest.fn(async () => {}),
    removeKey: jest.fn(async () => {}),
    removePrefix: jest.fn(async () => {}),
    sha256: () => "hash",
    songJson: () => ({}),
    renderChordpro: () => "{title: x}\n"
  }
}));
jest.mock("../helpers/NamesHelper", () => ({ userNames: jest.fn(async () => ({ owner000001: "Owner" })) }));
jest.mock("../helpers/CommonsMailHelper", () => ({ CommonsMailHelper: { notifyApproved: jest.fn(async () => {}), notifyRejected: jest.fn(async () => {}) } }));

import { PublishHelper } from "../helpers/PublishHelper";
import { ContentLibraryHelper } from "../helpers/ContentLibraryHelper";
import { CommonsMailHelper } from "../helpers/CommonsMailHelper";

const asset = (): any => ({ id: "asset000001", assetType: "song", name: "Old", status: "published", publisherUserId: "owner000001", publishedAt: new Date("2026-01-01"), publishedSubmissionId: "sub00000000" });
const qualityDetail = { heuristic: 30, parts: ["demo", "key"], llm: 0, notes: "completeness heuristic only — not an AI judgment" };
const submission = (): any => ({ id: "sub00000001", assetId: "asset000001", submittedBy: "stranger0001", status: "pending", triageScore: 30, payload: { name: "New Name", tags: " grace , praise ", license: "WC", qualityDetail, detail: { writer: "Fanny Crosby", chordPro: "Verse 1\r\n[G]Sing", bpm: 80 } } });

function repos(files: any[] = [], liveFiles: any[] = []) {
  const live = [...liveFiles];
  const r: any = {
    asset: { update: jest.fn(async () => {}), delete: jest.fn(async () => {}), loadById: jest.fn(async () => asset()) },
    submission: { update: jest.fn(async () => {}), countApproved: jest.fn(async () => 1), loadByAsset: jest.fn(async () => []), delete: jest.fn(async () => {}), loadById: jest.fn(async () => undefined) },
    assetFile: {
      loadBySubmission: jest.fn(async () => files),
      loadOne: jest.fn(async (_a: string, name: string) => live.find((f) => f.name === name)),
      loadLive: jest.fn(async () => live),
      update: jest.fn(async () => {}),
      delete: jest.fn(async () => {}),
      upsert: jest.fn(async (f: any) => { live.push(f); return f; }),
      deleteBySubmission: jest.fn(async () => {}),
      deleteByAsset: jest.fn(async () => {})
    },
    song: { loadSatellite: jest.fn(async () => ({ assetId: "asset000001", hymnalCount: 3 })), upsert: jest.fn(async () => {}), loadById: jest.fn(async () => ({ id: "asset000001", title: "New Name" })) },
    author: { findOrCreate: jest.fn(async () => "author00001"), loadById: jest.fn(async () => ({ id: "author00001", name: "Fanny Crosby" })), update: jest.fn(async () => {}) }
  };
  return r;
}

describe("PublishHelper.approve", () => {
  beforeEach(() => jest.clearAllMocks());

  it("applies generic fields, promotes add/replace/remove files, runs the song hook and manifest, then flips both rows", async () => {
    const proposed = [
      { id: "pf1", name: "tune.abc", action: "add" },
      { id: "pf2", name: "demoAudio.mp3", action: "replace" },
      { id: "pf3", name: "sheetPdf.pdf", action: "remove" }
    ];
    const r = repos(proposed, [{ id: "lf1", name: "demoAudio.mp3" }, { id: "lf2", name: "sheetPdf.pdf" }]);
    const a = asset();
    await PublishHelper.approve(r, submission(), a, "admin000001", "nice");

    expect(r.asset.update).toHaveBeenCalledWith("asset000001", expect.objectContaining({ name: "New Name", tags: "Grace, Praise", license: "WC" }));
    expect(ContentLibraryHelper.promote).toHaveBeenCalledWith("commons/pending/sub00000001/tune.abc", "commons/assets/song/asset000001/tune.abc");
    expect(ContentLibraryHelper.promote).toHaveBeenCalledWith("commons/pending/sub00000001/demoAudio.mp3", "commons/assets/song/asset000001/demoAudio.mp3");
    expect(ContentLibraryHelper.removeKey).toHaveBeenCalledWith("commons/assets/song/asset000001/sheetPdf.pdf");
    expect(r.assetFile.delete).toHaveBeenCalledWith("lf1");
    expect(r.assetFile.delete).toHaveBeenCalledWith("lf2");
    expect(r.assetFile.delete).toHaveBeenCalledWith("pf3");
    expect(r.assetFile.update).toHaveBeenCalledWith("pf1", { submissionId: null, action: "add" });
    expect(r.assetFile.update).toHaveBeenCalledWith("pf2", { submissionId: null, action: "add" });

    expect(r.author.findOrCreate).toHaveBeenCalledWith("Fanny Crosby");
    expect(r.author.findOrCreate).toHaveBeenCalledTimes(1);
    expect(r.song.upsert).toHaveBeenCalledWith(expect.objectContaining({ assetId: "asset000001", authorId: "author00001", chordPro: "Verse 1\n[G]Sing", bpm: 80, hymnalCount: 3, qualityScore: 30, qualityDetail: JSON.stringify(qualityDetail) }));
    const written = (ContentLibraryHelper.store as jest.Mock).mock.calls.map((c) => c[0]);
    expect(written).toEqual(expect.arrayContaining(["commons/assets/song/asset000001/song.json", "commons/assets/song/asset000001/lyrics.chordpro", "commons/assets/song/asset000001/manifest.json"]));
    const manifest = JSON.parse((ContentLibraryHelper.store as jest.Mock).mock.calls.find((c) => c[0].endsWith("manifest.json"))[2].toString());
    expect(manifest).toMatchObject({ id: "asset000001", name: "New Name", version: 2, publisher: { userName: "Owner" } });
    expect(manifest.files.map((f: any) => f.name)).not.toContain("manifest.json");

    expect(r.asset.update).toHaveBeenLastCalledWith("asset000001", expect.objectContaining({ status: "published", publishedSubmissionId: "sub00000001", publishedAt: a.publishedAt }));
    expect(r.submission.update).toHaveBeenCalledWith("sub00000001", expect.objectContaining({
      status: "approved",
      reviewedBy: "admin000001",
      reviewNote: "nice",
      filesChanged: [{ name: "tune.abc", action: "add" }, { name: "demoAudio.mp3", action: "replace" }, { name: "sheetPdf.pdf", action: "remove" }]
    }));
    expect(ContentLibraryHelper.removePrefix).toHaveBeenCalledWith("commons/pending/sub00000001");
    expect(CommonsMailHelper.notifyApproved).toHaveBeenCalledWith(expect.objectContaining({ id: "sub00000001" }), "asset000001");
  });

  it("stamps publishedAt on a first approval and skips the satellite for hook-less types", async () => {
    const r = repos([{ id: "pf1", name: "content.fstemplate", action: "add" }]);
    const a = { id: "asset000002", assetType: "freeshow/template", status: "pending", publisherUserId: "owner000001" } as any;
    await PublishHelper.approve(r, { ...submission(), payload: { name: "Wide", license: "CC0", detail: { appMinVersion: "1.4" } } }, a, "admin000001");
    expect(r.song.upsert).not.toHaveBeenCalled();
    expect(r.asset.update).toHaveBeenLastCalledWith("asset000002", expect.objectContaining({ status: "published", publishedAt: expect.any(Date) }));
    const manifest = JSON.parse((ContentLibraryHelper.store as jest.Mock).mock.calls[0][2].toString());
    expect(manifest.detail).toEqual({ appMinVersion: "1.4" });
  });

  it("findOrCreate each writer name instead of the combined byline", async () => {
    const r = repos();
    r.author.findOrCreate.mockImplementation(async (name: string) => name === "Ada" ? "authorAda001" : "authorBbb001");
    const sub = { ...submission(), payload: { ...submission().payload, detail: { writer: "Ada & Bea", chordPro: "[C]x" } } };
    await PublishHelper.approve(r, sub, asset(), "admin000001");
    expect(r.author.findOrCreate.mock.calls.map((c: any) => c[0])).toEqual(["Ada", "Bea"]);
    expect(r.song.upsert).toHaveBeenCalledWith(expect.objectContaining({ authorId: "authorAda001" }));
  });

  it("splits writers on commas and 'and' and keeps the first author as authorId", async () => {
    const r = repos();
    const ids: Record<string, string> = { Ada: "a1", Bea: "a2", Cy: "a3" };
    r.author.findOrCreate.mockImplementation(async (name: string) => ids[name]);
    const sub = { ...submission(), payload: { ...submission().payload, detail: { writer: "Ada, Bea and Cy", chordPro: "[C]x" } } };
    await PublishHelper.approve(r, sub, asset(), "admin000001");
    expect(r.author.findOrCreate.mock.calls.map((c: any) => c[0])).toEqual(["Ada", "Bea", "Cy"]);
    expect(r.song.upsert).toHaveBeenCalledWith(expect.objectContaining({ authorId: "a1" }));
  });

  it("claims the author row for the submitter when the song credits one writer", async () => {
    const r = repos();
    await PublishHelper.approve(r, submission(), asset(), "admin000001");
    expect(r.author.update).toHaveBeenCalledWith("author00001", { userId: "stranger0001" });
  });

  it("leaves an already claimed author row alone", async () => {
    const r = repos();
    r.author.loadById.mockResolvedValue({ id: "author00001", name: "Fanny Crosby", userId: "someoneelse" });
    await PublishHelper.approve(r, submission(), asset(), "admin000001");
    expect(r.author.update).not.toHaveBeenCalled();
  });

  it("does not claim an author row for a co-written song", async () => {
    const r = repos();
    const sub = { ...submission(), payload: { ...submission().payload, detail: { writer: "Ada & Bea", chordPro: "[C]x" } } };
    await PublishHelper.approve(r, sub, asset(), "admin000001");
    expect(r.author.update).not.toHaveBeenCalled();
  });

  it("fails loudly when a pending object is missing so the approve can be retried", async () => {
    (ContentLibraryHelper.promote as jest.Mock).mockResolvedValueOnce(false);
    const r = repos([{ id: "pf1", name: "tune.abc", action: "add" }]);
    await expect(PublishHelper.approve(r, submission(), asset(), "admin000001")).rejects.toThrow(/pending file missing/);
    expect(r.submission.update).not.toHaveBeenCalled();
    expect(CommonsMailHelper.notifyApproved).not.toHaveBeenCalled();
  });
});

describe("PublishHelper.reject / discard / remove", () => {
  beforeEach(() => jest.clearAllMocks());

  it("records the reason and note, purges pending files, and leaves a published asset untouched", async () => {
    const r = repos();
    await PublishHelper.reject(r, submission(), asset(), "admin000001", "quality", "needs a chorus");
    expect(r.submission.update).toHaveBeenCalledWith("sub00000001", expect.objectContaining({ status: "rejected", reviewReason: "quality", reviewNote: "needs a chorus" }));
    expect(ContentLibraryHelper.removePrefix).toHaveBeenCalledWith("commons/pending/sub00000001");
    expect(r.assetFile.deleteBySubmission).toHaveBeenCalledWith("sub00000001");
    expect(r.asset.delete).not.toHaveBeenCalled();
    expect(CommonsMailHelper.notifyRejected).toHaveBeenCalledWith(expect.objectContaining({ id: "sub00000001" }), "quality", "needs a chorus");
  });

  it("deletes a never-published asset when its only submission is rejected", async () => {
    const r = repos();
    await PublishHelper.reject(r, submission(), { ...asset(), status: "pending" }, "admin000001", "duplicate", "already in the library");
    expect(r.assetFile.deleteByAsset).toHaveBeenCalledWith("asset000001");
    expect(r.asset.delete).toHaveBeenCalledWith("asset000001");
  });

  it("keeps a pending asset alive while another draft or pending submission exists", async () => {
    const r = repos();
    r.submission.loadByAsset.mockResolvedValueOnce([{ id: "sub00000009", status: "draft" }]);
    await PublishHelper.discardProposed(r, submission(), { ...asset(), status: "pending" }, true);
    expect(r.submission.delete).toHaveBeenCalledWith("sub00000001");
    expect(r.asset.delete).not.toHaveBeenCalled();
  });

  it("takedown deletes the live prefix and files, withdraws open submissions, and tombstones the asset", async () => {
    const r = repos();
    r.submission.loadByAsset.mockResolvedValueOnce([{ id: "sub00000005", status: "pending" }]);
    await PublishHelper.remove(r, asset(), "copyright");
    expect(ContentLibraryHelper.removePrefix).toHaveBeenCalledWith("commons/assets/song/asset000001");
    expect(ContentLibraryHelper.removePrefix).toHaveBeenCalledWith("commons/pending/sub00000005");
    expect(r.submission.update).toHaveBeenCalledWith("sub00000005", { status: "withdrawn" });
    expect(r.assetFile.deleteByAsset).toHaveBeenCalledWith("asset000001");
    expect(r.asset.update).toHaveBeenCalledWith("asset000001", { status: "removed", removedReason: "copyright" });
  });
});

describe("PublishHelper.diffFields", () => {
  it("flattens generic + detail fields and reports only what changed", () => {
    const diff = PublishHelper.diffFields({ name: "A", license: "WC", detail: { bpm: 80, writer: "X" } }, { name: "B", license: "WC", detail: { bpm: 80, writer: "Y", songKey: "G" } });
    expect(diff).toEqual([
      { key: "name", from: "A", to: "B" },
      { key: "detail.writer", from: "X", to: "Y" },
      { key: "detail.songKey", from: undefined, to: "G" }
    ]);
  });
});
