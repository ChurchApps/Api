import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../helpers/ContentLibraryHelper", () => {
  const L = jest.requireActual("../helpers/PackageLayout");
  const liveKey = (a: any, n: string) => (L.isPackageKey(n) ? `commons/${n}` : `commons/assets/${a.assetType}/${a.id}/${n}`);
  return {
    ContentLibraryHelper: {
      livePrefix: (a: any) => `commons/assets/${a.assetType}/${a.id}`,
      liveKey,
      packagePrefix: (dir: string) => `commons/${dir}`,
      fileKey: (a: any, files: any[], n: string) => liveKey(a, L.findByBase(files, a.assetType, n)?.name || L.packageKey(L.packageDirFrom(files), a.assetType, n)),
      pendingPrefix: (id: string) => `commons/pending/${id}`,
      pendingKey: (id: string, n: string) => `commons/pending/${id}/${n}`,
      promote: jest.fn(async () => true),
      store: jest.fn(async () => {}),
      removeKey: jest.fn(async () => {}),
      removePrefix: jest.fn(async () => {}),
      readKey: jest.fn(async () => null),
      sha256: () => "hash",
      role: (n: string) => n.replace(/\.[^.]+$/, ""),
      songJson: () => ({}),
      renderChordpro: () => "{title: x}\n"
    }
  };
});
jest.mock("../helpers/NamesHelper", () => ({ userNames: jest.fn(async () => ({ owner000001: "Owner", stranger0001: "Stranger Sam" })) }));
jest.mock("../helpers/CommonsMailHelper", () => ({ CommonsMailHelper: { notifyApproved: jest.fn(async () => {}), notifyRejected: jest.fn(async () => {}), notifyChangesRequested: jest.fn(async () => {}) } }));

import { PublishHelper } from "../helpers/PublishHelper";
import { ContentLibraryHelper } from "../helpers/ContentLibraryHelper";
import { CommonsMailHelper } from "../helpers/CommonsMailHelper";

const asset = (): any => ({ id: "asset000001", assetType: "song", name: "Old", language: "English", status: "published", publisherUserId: "owner000001", publishedAt: new Date("2026-01-01"), publishedSubmissionId: "sub00000000" });
// the package a legacy or brand-new song lands in: the title, language and license at the time of the approve (the payload renames it and sets WC)
const PKG = "songs/en/wc-license/new-name-asset000001";
// a song already in the layout keeps its frozen folder whatever its title becomes
const FROZEN = "songs/en/public-domain/old-asset000001";
const LEGACY = "commons/assets/song/asset000001";
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
      // mirrors the DB: clearing submissionId makes a proposed row live; delete drops a live row
      update: jest.fn(async (id: string, fields: any) => {
        const promoted = fields.submissionId === null && files.find((f) => f.id === id);
        if (promoted) live.push({ ...promoted, ...fields });
      }),
      delete: jest.fn(async (id: string) => {
        const i = live.findIndex((f) => f.id === id);
        if (i >= 0) live.splice(i, 1);
      }),
      upsert: jest.fn(async (f: any) => { live.push(f); return f; }),
      deleteBySubmission: jest.fn(async () => {}),
      deleteByAsset: jest.fn(async () => {})
    },
    song: { loadSatellite: jest.fn(async () => ({ assetId: "asset000001", hymnalCount: 3, contributors: null })), upsert: jest.fn(async () => {}), loadById: jest.fn(async () => ({ id: "asset000001", title: "New Name" })) },
    author: { findOrCreate: jest.fn(async () => "author00001"), loadById: jest.fn(async () => ({ id: "author00001", name: "Fanny Crosby" })), update: jest.fn(async () => {}) }
  };
  return r;
}

describe("PublishHelper.approve", () => {
  beforeEach(() => jest.clearAllMocks());

  it("applies generic fields, promotes add/replace/remove files into the package's sources/, runs the song hook and manifest, then flips both rows", async () => {
    const proposed = [
      { id: "pf1", name: "tune.abc", action: "add" },
      { id: "pf2", name: "demoAudio.mp3", action: "replace" },
      { id: "pf3", name: "sheetPdf.pdf", action: "remove" }
    ];
    const r = repos(proposed, [{ id: "lf1", name: "sources/demoAudio.mp3" }, { id: "lf2", name: "sources/sheetPdf.pdf" }]);
    const a = asset();
    await PublishHelper.approve(r, submission(), a, "admin000001", "nice");

    expect(r.asset.update).toHaveBeenCalledWith("asset000001", expect.objectContaining({ name: "New Name", tags: "Grace, Praise", license: "WC" }));
    expect(ContentLibraryHelper.promote).toHaveBeenCalledWith("commons/pending/sub00000001/tune.abc", `commons/${PKG}/sources/tune.abc`);
    expect(ContentLibraryHelper.promote).toHaveBeenCalledWith("commons/pending/sub00000001/demoAudio.mp3", `commons/${PKG}/sources/demoAudio.mp3`);
    // the legacy copies: the removed file, and the one a re-upload superseded into the package
    expect(ContentLibraryHelper.removeKey).toHaveBeenCalledWith(`${LEGACY}/sources/sheetPdf.pdf`);
    expect(ContentLibraryHelper.removeKey).toHaveBeenCalledWith(`${LEGACY}/sources/demoAudio.mp3`);
    expect(ContentLibraryHelper.removeKey).toHaveBeenCalledTimes(2);
    expect(r.assetFile.delete).toHaveBeenCalledWith("lf1");
    expect(r.assetFile.delete).toHaveBeenCalledWith("lf2");
    expect(r.assetFile.delete).toHaveBeenCalledWith("pf3");
    expect(r.assetFile.update).toHaveBeenCalledWith("pf1", { submissionId: null, action: "add", name: `${PKG}/sources/tune.abc` });
    expect(r.assetFile.update).toHaveBeenCalledWith("pf2", { submissionId: null, action: "add", name: `${PKG}/sources/demoAudio.mp3` });

    expect(r.author.findOrCreate).toHaveBeenCalledWith("Fanny Crosby");
    expect(r.author.findOrCreate).toHaveBeenCalledTimes(1);
    expect(r.song.upsert).toHaveBeenCalledWith(expect.objectContaining({ assetId: "asset000001", authorId: "author00001", chordPro: "Verse 1\n[G]Sing", bpm: 80, hymnalCount: 3, qualityScore: 30, qualityDetail: JSON.stringify(qualityDetail) }));
    // the hook's two masters and the sources manifest, in the three-folder layout under the package path
    const written = (ContentLibraryHelper.store as jest.Mock).mock.calls.map((c) => c[0]);
    expect(written.sort()).toEqual([`commons/${PKG}/masters/lyrics.chordpro`, `commons/${PKG}/masters/song.json`, `commons/${PKG}/sources/manifest.json`]);
    expect(r.assetFile.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: `${PKG}/masters/song.json`, submissionId: null }));
    // nothing here was uploaded by a person (no uploadedBy), so the manifest has no rows yet
    expect(manifestWritten()).toEqual({ files: [] });

    expect(r.asset.update).toHaveBeenLastCalledWith("asset000001", expect.objectContaining({ status: "published", publishedSubmissionId: "sub00000001", publishedAt: a.publishedAt }));
    expect(r.submission.update).toHaveBeenCalledWith("sub00000001", expect.objectContaining({
      status: "approved",
      reviewedBy: "admin000001",
      reviewNote: "nice",
      filesChanged: [{ name: `${PKG}/sources/tune.abc`, action: "add" }, { name: `${PKG}/sources/demoAudio.mp3`, action: "replace" }, { name: "sources/sheetPdf.pdf", action: "remove" }]
    }));
    expect(ContentLibraryHelper.removePrefix).toHaveBeenCalledWith("commons/pending/sub00000001");
    expect(CommonsMailHelper.notifyApproved).toHaveBeenCalledWith(expect.objectContaining({ id: "sub00000001" }), "asset000001", []);
  });

  it("places art in masters/, renames the browser thumb onto the pipeline thumb, and supersedes a same-named file in another folder", async () => {
    const proposed = [
      { id: "pf1", name: "art.png", action: "add" },
      { id: "pf2", name: "art-thumb.webp", action: "add" },
      { id: "pf3", name: "score.musicxml", action: "add" }
    ];
    const r = repos(proposed, [{ id: "lf1", name: "derivatives/cover-thumb.webp" }, { id: "lf2", name: "derivatives/score.musicxml" }]);
    await PublishHelper.approve(r, submission(), asset(), "admin000001");
    expect(ContentLibraryHelper.promote).toHaveBeenCalledWith("commons/pending/sub00000001/art.png", `commons/${PKG}/masters/art.png`);
    expect(ContentLibraryHelper.promote).toHaveBeenCalledWith("commons/pending/sub00000001/art-thumb.webp", `commons/${PKG}/derivatives/cover-thumb.webp`);
    expect(ContentLibraryHelper.promote).toHaveBeenCalledWith("commons/pending/sub00000001/score.musicxml", `commons/${PKG}/sources/score.musicxml`);
    // both legacy files are superseded by the package copies
    expect(ContentLibraryHelper.removeKey).toHaveBeenCalledTimes(2);
    expect(ContentLibraryHelper.removeKey).toHaveBeenCalledWith(`${LEGACY}/derivatives/cover-thumb.webp`);
    expect(ContentLibraryHelper.removeKey).toHaveBeenCalledWith(`${LEGACY}/derivatives/score.musicxml`);
    expect(r.assetFile.delete).toHaveBeenCalledWith("lf1");
    expect(r.assetFile.delete).toHaveBeenCalledWith("lf2");
    expect(r.assetFile.update).toHaveBeenCalledWith("pf2", { submissionId: null, action: "add", name: `${PKG}/derivatives/cover-thumb.webp` });
    expect(r.submission.update).toHaveBeenCalledWith("sub00000001", expect.objectContaining({ filesChanged: [{ name: `${PKG}/masters/art.png`, action: "add" }, { name: `${PKG}/derivatives/cover-thumb.webp`, action: "replace" }, { name: `${PKG}/sources/score.musicxml`, action: "replace" }] }));
    // the hook sees the placed names and still reads the score by basename
    expect(r.song.upsert).toHaveBeenCalledWith(expect.objectContaining({ scoreSource: "master", confidence: "proofread-score" }));
  });

  it("leaves a non-song asset's files flat", async () => {
    const r = repos([{ id: "pf1", name: "thumb.png", action: "add" }], [{ id: "lf1", name: "content.fstemplate" }]);
    const a = { id: "asset000002", assetType: "freeshow/template", status: "published", publisherUserId: "owner000001", publishedSubmissionId: "sub00000000" } as any;
    await PublishHelper.approve(r, { ...submission(), payload: { name: "Wide", license: "CC0" } }, a, "admin000001");
    expect(ContentLibraryHelper.promote).toHaveBeenCalledWith("commons/pending/sub00000001/thumb.png", "commons/assets/freeshow/template/asset000002/thumb.png");
    expect(r.assetFile.update).toHaveBeenCalledWith("pf1", { submissionId: null, action: "add", name: "thumb.png" });
    expect((ContentLibraryHelper.store as jest.Mock).mock.calls.map((c) => c[0])).toEqual(["commons/assets/freeshow/template/asset000002/manifest.json"]);
  });

  it("partial approve: declined files are neither promoted nor kept, and the record says why", async () => {
    const proposed = [
      { id: "pf1", name: "tune.abc", action: "add" },
      { id: "pf2", name: "demoAudio.mp3", action: "replace" },
      { id: "pf3", name: "sheetPdf.pdf", action: "add" }
    ];
    const r = repos(proposed, [{ id: "lf1", name: "sources/demoAudio.mp3" }]);
    const declined = [{ name: "sheetPdf.pdf", reason: "blurry scan" }, { name: "demoAudio.mp3", reason: "clipping" }];
    await PublishHelper.approve(r, submission(), asset(), "admin000001", "score is good", declined);

    expect(ContentLibraryHelper.promote).toHaveBeenCalledTimes(1);
    expect(ContentLibraryHelper.promote).toHaveBeenCalledWith("commons/pending/sub00000001/tune.abc", `commons/${PKG}/sources/tune.abc`);
    expect(r.assetFile.delete).toHaveBeenCalledWith("pf2");
    expect(r.assetFile.delete).toHaveBeenCalledWith("pf3");
    expect(r.assetFile.delete).not.toHaveBeenCalledWith("lf1");
    expect(r.assetFile.update).toHaveBeenCalledTimes(1);
    expect(r.submission.update).toHaveBeenCalledWith("sub00000001", expect.objectContaining({
      status: "approved",
      filesChanged: [
        { name: `${PKG}/sources/tune.abc`, action: "add" },
        { name: "demoAudio.mp3", action: "declined", reason: "clipping" },
        { name: "sheetPdf.pdf", action: "declined", reason: "blurry scan" }
      ]
    }));
    expect(ContentLibraryHelper.removePrefix).toHaveBeenCalledWith("commons/pending/sub00000001");
    expect(CommonsMailHelper.notifyApproved).toHaveBeenCalledWith(expect.objectContaining({ id: "sub00000001" }), "asset000001", declined);
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
    expect(ContentLibraryHelper.removePrefix).toHaveBeenCalledTimes(2);
    expect(r.submission.update).toHaveBeenCalledWith("sub00000005", { status: "withdrawn" });
    expect(r.assetFile.deleteByAsset).toHaveBeenCalledWith("asset000001");
    expect(r.asset.update).toHaveBeenCalledWith("asset000001", { status: "removed", removedReason: "copyright" });
  });

  it("takedown of a song in the package layout deletes its package too, never the work's shared files", async () => {
    const r = repos([], [{ id: "lf1", name: `${FROZEN}/sources/tune.abc` }, { id: "lf2", name: "works/abide/sources/tune.mid" }]);
    await PublishHelper.remove(r, asset(), "copyright");
    expect(ContentLibraryHelper.removePrefix).toHaveBeenCalledWith("commons/assets/song/asset000001");
    expect(ContentLibraryHelper.removePrefix).toHaveBeenCalledWith(`commons/${FROZEN}`);
    expect(ContentLibraryHelper.removePrefix).toHaveBeenCalledTimes(2);
  });
});

describe("PublishHelper.requestChanges", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the submission to draft with the note and leaves the proposed files in place", async () => {
    const r = repos([{ id: "pf1", name: "tune.abc", action: "add" }]);
    await PublishHelper.requestChanges(r, submission(), "admin000001", "bar 12 needs a chord");
    expect(r.submission.update).toHaveBeenCalledWith("sub00000001", { status: "draft", reviewedBy: "admin000001", reviewedAt: expect.any(Date), reviewReason: "changes", reviewNote: "bar 12 needs a chord" });
    expect(ContentLibraryHelper.removePrefix).not.toHaveBeenCalled();
    expect(r.assetFile.deleteBySubmission).not.toHaveBeenCalled();
    expect(r.assetFile.delete).not.toHaveBeenCalled();
    expect(r.asset.delete).not.toHaveBeenCalled();
    expect(CommonsMailHelper.notifyChangesRequested).toHaveBeenCalledWith(expect.objectContaining({ id: "sub00000001" }), "bar 12 needs a chord");
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

const manifestWritten = () => JSON.parse((ContentLibraryHelper.store as jest.Mock).mock.calls.find((c) => c[0].endsWith("/sources/manifest.json"))[2].toString());
const contributorsUpserted = (r: any) => JSON.parse(r.song.upsert.mock.calls[0][0].contributors);

describe("PublishHelper.approve — sources manifest", () => {
  beforeEach(() => jest.clearAllMocks());

  it("writes sources/manifest.json in the content repo's shape: one contributor row per uploaded file, none for generated files", async () => {
    const proposed = [{ id: "pf1", name: "tune.abc", action: "add", contentHash: "abc123", uploadedBy: "stranger0001" }];
    const r = repos(proposed, []);
    await PublishHelper.approve(r, { ...submission(), note: "transcribed from the 1912 hymnal" }, asset(), "admin000001");
    expect((ContentLibraryHelper.store as jest.Mock).mock.calls.map((c) => c[0])).toContain(`commons/${PKG}/sources/manifest.json`);
    expect(manifestWritten()).toEqual({
      files: [
        {
          file: "tune.abc",
          url: null,
          acquired: new Date().toISOString().slice(0, 10),
          sha256: "abc123",
          licenseBasis: "contributor",
          original: true,
          submittedBy: "stranger0001",
          submission: "sub00000001",
          note: "transcribed from the 1912 hymnal"
        }
      ]
    });
  });

  it("keeps the frozen package folder, preserves harvested and earlier rows, replaces a re-uploaded file's row, and backfills an upload with no row", async () => {
    const previous = { file: "demoAudio.mp3", url: null, acquired: "2026-01-02", sha256: "oldhash", licenseBasis: "contributor", original: true, submittedBy: "owner000001", submission: "sub00000000", note: "first demo" };
    const harvested = { file: "hymnary.json", url: null, acquired: null, sha256: "h", licenseBasis: "hymnary", original: false, submittedBy: null, note: "Harvested hymnal counts" };
    const seeded = { files: [previous, { ...previous, file: "sheetPdf.pdf", sha256: "stale" }, harvested] };
    (ContentLibraryHelper.readKey as jest.Mock).mockImplementation(async (key: string) => (key === `commons/${FROZEN}/sources/manifest.json` ? { buffer: Buffer.from(JSON.stringify(seeded)), contentType: "application/json" } : null));
    const live = [
      { id: "lf1", name: `${FROZEN}/sources/demoAudio.mp3`, contentHash: "oldhash", uploadedBy: "owner000001", createdAt: new Date("2026-01-02") },
      { id: "lf2", name: `${FROZEN}/sources/sheetPdf.pdf`, contentHash: "pdfhash", uploadedBy: "owner000001", createdAt: new Date("2026-02-03") },
      { id: "lf3", name: `${FROZEN}/masters/art.png`, contentHash: "arthash", uploadedBy: "owner000001", createdAt: new Date("2026-03-04T12:00:00Z") },
      { id: "lf4", name: `${FROZEN}/masters/song.json`, contentHash: "gen", uploadedBy: null },
      { id: "lf5", name: "works/abide/sources/tune.mid", contentHash: "w", uploadedBy: null }
    ];
    const proposed = [{ id: "pf2", name: "sheetPdf.pdf", action: "replace", contentHash: "pdfhash", uploadedBy: "stranger0001" }];
    const r = repos(proposed, live);
    await PublishHelper.approve(r, { ...submission(), note: "cleaner scan" }, asset(), "admin000001");
    // the title changed to "New Name" but the folder is frozen: promotion, masters and manifest all land in it
    expect(ContentLibraryHelper.promote).toHaveBeenCalledWith("commons/pending/sub00000001/sheetPdf.pdf", `commons/${FROZEN}/sources/sheetPdf.pdf`);
    expect((ContentLibraryHelper.store as jest.Mock).mock.calls.map((c) => c[0]).sort()).toEqual([`commons/${FROZEN}/masters/lyrics.chordpro`, `commons/${FROZEN}/masters/song.json`, `commons/${FROZEN}/sources/manifest.json`]);
    const rows = manifestWritten().files;
    expect(rows.find((s: any) => s.file === "demoAudio.mp3")).toEqual(previous);
    expect(rows.find((s: any) => s.file === "hymnary.json")).toEqual(harvested);
    expect(rows.find((s: any) => s.file === "sheetPdf.pdf")).toMatchObject({ sha256: "pdfhash", submission: "sub00000001", submittedBy: "stranger0001", note: "cleaner scan" });
    expect(rows.find((s: any) => s.file === "masters/art.png")).toEqual({ file: "masters/art.png", url: null, acquired: "2026-03-04", sha256: "arthash", licenseBasis: "contributor", original: true, submittedBy: "owner000001", submission: null, note: null });
    expect(rows.some((s: any) => s.file.endsWith("song.json") || s.file.endsWith("tune.mid"))).toBe(false);
    (ContentLibraryHelper.readKey as jest.Mock).mockReset().mockResolvedValue(null);
  });

  it("reads a pre-cut-over song's root manifest.json from the legacy folder and carries its rows into sources/manifest.json", async () => {
    const legacyRow = { file: "sources/demoAudio.mp3", url: null, acquired: "2026-01-02", sha256: "oldhash", licenseBasis: "contributor", original: true, submittedBy: "owner000001", submission: "sub00000000", note: "first demo" };
    (ContentLibraryHelper.readKey as jest.Mock).mockImplementation(async (key: string) => (key === `${LEGACY}/manifest.json` ? { buffer: Buffer.from(JSON.stringify({ id: "asset000001", files: [{ name: "sources/demoAudio.mp3", role: "demoAudio" }], sources: [legacyRow] })), contentType: "application/json" } : null));
    const live = [{ id: "lf1", name: "sources/demoAudio.mp3", contentHash: "oldhash", uploadedBy: "owner000001", createdAt: new Date("2026-01-02") }];
    const r = repos([], live);
    await PublishHelper.approve(r, submission(), asset(), "admin000001");
    expect(ContentLibraryHelper.readKey).toHaveBeenCalledWith(`${LEGACY}/manifest.json`);
    expect(manifestWritten()).toEqual({ files: [{ ...legacyRow, file: "demoAudio.mp3" }] });
    (ContentLibraryHelper.readKey as jest.Mock).mockReset().mockResolvedValue(null);
  });
});

describe("PublishHelper.approve — contributors", () => {
  beforeEach(() => jest.clearAllMocks());

  it("appends the submitter with the type label and keeps earlier credits", async () => {
    const r = repos();
    r.song.loadSatellite.mockResolvedValueOnce({ assetId: "asset000001", hymnalCount: 3, contributors: JSON.stringify([{ name: "Owner", what: "new song", submissionId: "sub00000000", at: "2026-01-01T00:00:00.000Z" }]) });
    await PublishHelper.approve(r, { ...submission(), type: "correction" }, asset(), "admin000001");
    const rows = contributorsUpserted(r);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Owner", what: "new song", submissionId: "sub00000000", at: "2026-01-01T00:00:00.000Z" });
    expect(rows[1]).toMatchObject({ name: "Stranger Sam", what: "correction", submissionId: "sub00000001" });
    expect(new Date(rows[1].at).getTime()).toBeGreaterThan(0);
  });

  it("dedupes by submission on an approve retry and credits a named translator alongside the submitter", async () => {
    const r = repos();
    r.song.loadSatellite.mockResolvedValueOnce({ assetId: "asset000001", contributors: JSON.stringify([{ name: "Stranger Sam", what: "translation", submissionId: "sub00000001", at: "2026-05-05T00:00:00.000Z" }]) });
    const sub = { ...submission(), type: "translation", payload: { ...submission().payload, detail: { writer: "Anon", chordPro: "[C]x", translator: "Ana Lopez", parentSongId: "asset000009" } } };
    await PublishHelper.approve(r, sub, asset(), "admin000001");
    const rows = contributorsUpserted(r);
    expect(rows.map((c: any) => [c.name, c.what])).toEqual([["Stranger Sam", "translation"], ["Ana Lopez", "translator"]]);
  });

  it("labels the other types and survives an unreadable contributors column", async () => {
    for (const [type, what] of [["new", "new song"], ["arrangement", "arrangement"], ["additionalFile", "additional file"]]) {
      jest.clearAllMocks();
      const r = repos();
      r.song.loadSatellite.mockResolvedValueOnce({ assetId: "asset000001", contributors: "not json" });
      await PublishHelper.approve(r, { ...submission(), type }, asset(), "admin000001");
      expect(contributorsUpserted(r)).toEqual([expect.objectContaining({ name: "Stranger Sam", what })]);
    }
  });
});

describe("PublishHelper.approve — removal", () => {
  beforeEach(() => jest.clearAllMocks());

  it("unpublishes the asset, keeps files, satellite and history, and approves the submission without touching fields", async () => {
    const r = repos();
    const a = asset();
    await PublishHelper.approve(r, { ...submission(), type: "removal", payload: { type: "removal" } }, a, "admin000001", "as requested");
    expect(r.asset.update).toHaveBeenCalledTimes(1);
    expect(r.asset.update).toHaveBeenCalledWith("asset000001", expect.objectContaining({ status: "unpublished", removedReason: "publisher", unpublishedAt: expect.any(Date) }));
    expect(r.song.upsert).not.toHaveBeenCalled();
    expect(ContentLibraryHelper.promote).not.toHaveBeenCalled();
    expect(ContentLibraryHelper.store).not.toHaveBeenCalled();
    expect(r.assetFile.deleteByAsset).not.toHaveBeenCalled();
    expect(r.asset.delete).not.toHaveBeenCalled();
    expect(r.submission.update).toHaveBeenCalledWith("sub00000001", expect.objectContaining({ status: "approved", reviewedBy: "admin000001", reviewNote: "as requested", filesChanged: [] }));
    expect(CommonsMailHelper.notifyApproved).toHaveBeenCalledWith(expect.objectContaining({ id: "sub00000001", type: "removal" }), "asset000001");
  });

  it("leaves an already unpublished asset alone", async () => {
    const r = repos();
    await PublishHelper.approve(r, { ...submission(), type: "removal" }, { ...asset(), status: "unpublished" }, "admin000001");
    expect(r.asset.update).not.toHaveBeenCalled();
    expect(r.submission.update).toHaveBeenCalledWith("sub00000001", expect.objectContaining({ status: "approved" }));
  });
});
