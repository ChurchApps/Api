import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../helpers/ContentLibraryHelper", () => ({
  ContentLibraryHelper: {
    pendingKey: (id: string, name: string) => `commons/pending/${id}/${name}`,
    storePending: jest.fn(async () => {}),
    exists: jest.fn(async () => true),
    removeKey: jest.fn(async () => {}),
    contentTypeFor: () => "application/octet-stream",
    sha256: () => "hash"
  }
}));
jest.mock("../helpers/QualityHelper", () => ({ QualityHelper: { score: jest.fn(async () => ({ qualityScore: 21 })) } }));

import { SubmissionHelper } from "../helpers/SubmissionHelper";
import { ContentLibraryHelper } from "../helpers/ContentLibraryHelper";
import { QualityHelper } from "../helpers/QualityHelper";

const au = { id: "user0000001", churchId: "church00001" };
const payload = { name: "New Hymn", license: "WC", tags: "Grace", detail: { writer: "Anon", chordPro: "Verse 1\n[G]Sing", certified: true } };

function repos(overrides: any = {}) {
  const r: any = {
    asset: {
      create: jest.fn(async (a: any) => { a.id = "asset000001"; return a; }),
      loadById: jest.fn(async (id: string) => ({ id, assetType: "song", status: "published", publisherUserId: "owner000001" }))
    },
    submission: {
      create: jest.fn(async (s: any) => { s.id = "sub00000001"; s.status = "draft"; return s; }),
      countByUser: jest.fn(async () => 0),
      countSubmittedSince: jest.fn(async () => 0),
      submit: jest.fn(async () => true),
      loadPendingForAsset: jest.fn(async () => undefined)
    },
    assetFile: {
      loadOne: jest.fn(async () => undefined),
      upsert: jest.fn(async (f: any) => ({ ...f, id: "file0000001" })),
      loadBySubmission: jest.fn(async () => []),
      loadLive: jest.fn(async () => []),
      loadLiveByHash: jest.fn(async () => undefined)
    }
  };
  for (const [k, v] of Object.entries(overrides)) Object.assign(r[k], v);
  return r;
}

describe("SubmissionHelper.createDraft", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a pending asset seeded from the payload plus a draft submission for a new asset", async () => {
    const r = repos();
    const result: any = await SubmissionHelper.createDraft(r, au, { assetType: "song", payload });
    expect(result.ok).toBe(true);
    expect(r.asset.create).toHaveBeenCalledWith(expect.objectContaining({ assetType: "song", name: "New Hymn", status: "pending", publisherUserId: "user0000001", license: "WC" }));
    expect(r.submission.create).toHaveBeenCalledWith(expect.objectContaining({ assetId: "asset000001", submittedBy: "user0000001", payload }));
    expect(result.value.submission.status).toBe("draft");
  });

  it("targets an existing asset for a modification without touching the asset row", async () => {
    const r = repos();
    const result: any = await SubmissionHelper.createDraft(r, au, { assetId: "asset000009", payload, note: "fixed a chord" });
    expect(result.ok).toBe(true);
    expect(r.asset.create).not.toHaveBeenCalled();
    expect(r.submission.create).toHaveBeenCalledWith(expect.objectContaining({ assetId: "asset000009", submittedBy: "user0000001", note: "fixed a chord" }));
  });

  it("refuses unknown types and removed assets", async () => {
    expect((await SubmissionHelper.createDraft(repos(), au, { assetType: "nope", payload }) as any).status).toBe(400);
    const r = repos({ asset: { loadById: jest.fn(async () => ({ id: "x", status: "removed" })) } });
    expect((await SubmissionHelper.createDraft(r, au, { assetId: "x", payload }) as any).status).toBe(404);
  });
});

describe("SubmissionHelper files", () => {
  beforeEach(() => jest.clearAllMocks());
  const sub: any = { id: "sub00000001", status: "draft", submittedBy: "user0000001" };
  const asset: any = { id: "asset000001", assetType: "song" };

  it("infers add vs replace from the live file set and stores pending bytes privately", async () => {
    const r = repos();
    const added: any = await SubmissionHelper.storeInline(r, sub, asset, "tune.abc", "text/plain", Buffer.from("X:1"), "user0000001");
    expect(added.ok).toBe(true);
    expect(ContentLibraryHelper.storePending).toHaveBeenCalledWith("commons/pending/sub00000001/tune.abc", "text/plain", expect.any(Buffer));
    expect(r.assetFile.upsert).toHaveBeenCalledWith(expect.objectContaining({ submissionId: "sub00000001", name: "tune.abc", action: "add", uploadedBy: "user0000001" }));

    r.assetFile.loadOne.mockResolvedValueOnce({ id: "live0000001", name: "demoAudio.mp3" });
    await SubmissionHelper.recordFile(r, sub, asset, { name: "demoAudio.mp3", sizeBytes: 10 });
    expect(r.assetFile.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ name: "demoAudio.mp3", action: "replace" }));
  });

  it("rejects names the registry does not know and removals of files that are not live", async () => {
    const r = repos();
    expect((await SubmissionHelper.recordFile(r, sub, asset, { name: "virus.exe", sizeBytes: 1 }) as any).status).toBe(400);
    expect((await SubmissionHelper.recordFile(r, sub, asset, { name: "tune.abc", action: "remove" }) as any).status).toBe(400);
  });
});

describe("SubmissionHelper.submit", () => {
  beforeEach(() => jest.clearAllMocks());
  const draft = (): any => ({ id: "sub00000001", assetId: "asset000001", status: "draft", submittedBy: "user0000001", payload });
  const asset: any = { id: "asset000001", assetType: "song", publisherUserId: "user0000001" };

  it("moves a valid draft to pending with a triage score", async () => {
    const r = repos({ assetFile: { loadBySubmission: jest.fn(async () => [{ name: "demoAudio.mp3", sizeBytes: 100, action: "add" }]) } });
    const sub = draft();
    sub.payload = { ...payload, detail: { ...payload.detail, recordingOwned: true } };
    const result: any = await SubmissionHelper.submit(r, sub, asset);
    expect(result).toEqual({ ok: true, value: { status: "pending" } });
    expect(QualityHelper.score).toHaveBeenCalledWith(expect.objectContaining({ title: "New Hymn", fileRoles: ["demoAudio"] }));
    expect(r.submission.submit).toHaveBeenCalledWith("sub00000001", "asset000001", 21);
  });

  it("returns 400 with the registry's message when validation fails", async () => {
    const sub = draft();
    sub.payload = { ...payload, detail: { ...payload.detail, writer: "" } };
    const result: any = await SubmissionHelper.submit(repos(), sub, asset);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(/Writer/);
  });

  it("returns 400 when a recorded file was never uploaded", async () => {
    (ContentLibraryHelper.exists as jest.Mock).mockResolvedValueOnce(false);
    const r = repos({ assetFile: { loadBySubmission: jest.fn(async () => [{ name: "tune.abc", sizeBytes: 5, action: "add" }]) } });
    const result: any = await SubmissionHelper.submit(r, draft(), asset);
    expect(result).toMatchObject({ status: 400, error: "tune.abc was not uploaded" });
  });

  it("returns 409 when the primary file already exists on another asset", async () => {
    const r = repos({
      assetFile: {
        loadBySubmission: jest.fn(async () => [{ name: "content.fstemplate", sizeBytes: 5, action: "add", contentHash: "abc" }]),
        loadLiveByHash: jest.fn(async () => ({ assetId: "asset000777" }))
      }
    });
    const result: any = await SubmissionHelper.submit(r, { ...draft(), payload: { name: "Wide", license: "CC0" } }, { id: "asset000001", assetType: "freeshow/template" });
    expect(result.status).toBe(409);
  });

  it("returns 429 when the user has too many pending or daily submissions", async () => {
    expect((await SubmissionHelper.submit(repos({ submission: { countByUser: jest.fn(async () => 5) } }), draft(), asset) as any).status).toBe(429);
    expect((await SubmissionHelper.submit(repos({ submission: { countSubmittedSince: jest.fn(async () => 20) } }), draft(), asset) as any).status).toBe(429);
  });

  it("returns 409 naming the competing submission when another pending one targets the asset", async () => {
    const r = repos({ submission: { submit: jest.fn(async () => false), loadPendingForAsset: jest.fn(async () => ({ id: "sub00000002" })) } });
    const result: any = await SubmissionHelper.submit(r, draft(), asset);
    expect(result.status).toBe(409);
    expect(result.error).toContain("sub00000002");
  });

  it("refuses anything that is not a draft", async () => {
    expect((await SubmissionHelper.submit(repos(), { ...draft(), status: "pending" }, asset) as any).status).toBe(400);
  });
});
