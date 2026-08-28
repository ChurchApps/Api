import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../shared/helpers/index", () => ({
  Permissions: { server: { admin: { contentType: "Server", action: "Admin" } } },
  Environment: { worshipCommonsRoot: "http://localhost:3104" }
}));
jest.mock("../helpers/index", () => ({
  ContentLibraryHelper: {
    requestApiBase: () => "http://api",
    signedPendingUrl: jest.fn(async (id: string, name: string) => `signed:${id}/${name}`),
    previewToken: () => "tok",
    fileUrls: () => ({})
  },
  PublishHelper: {
    approve: jest.fn(async () => {}),
    reject: jest.fn(async () => {}),
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

const pending = (): any => ({ id: "sub00000001", assetId: "asset000001", submittedBy: "user0000001", status: "pending", payload: { name: "Proposed" } });

function adminController(overrides: any = {}, admin = true) {
  const repos: any = {
    submission: { loadById: jest.fn(async () => pending()), loadQueue: jest.fn(async () => []), countSubmitterStats: jest.fn(async () => ({ total: 3, approved: 2 })) },
    asset: { loadById: jest.fn(async () => ({ id: "asset000001", assetType: "song", name: "Live", status: "published", publisherUserId: "owner000001", publishedSubmissionId: "sub00000000" })), update: jest.fn(async () => {}), loadByIds: jest.fn(async () => []) },
    assetFile: { loadBySubmission: jest.fn(async () => [{ name: "tune.abc", action: "add" }]), loadLive: jest.fn(async () => []) },
    report: { loadById: jest.fn(async () => ({ id: "rep00000001", assetId: "asset000001", reason: "copyright", status: "open" })), update: jest.fn(async () => {}), loadAll: jest.fn(async () => []) }
  };
  for (const [k, v] of Object.entries(overrides)) Object.assign(repos[k], v);
  const au = { id: "admin000001", checkAccess: () => admin };
  const controller = new CommonsAdminController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

const req = (body: any = {}, id = "sub00000001", query: any = {}) => ({ params: { id }, body, query, headers: {} } as any);

describe("admin submissions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("gates everything on Server/Admin", async () => {
    const { controller } = adminController({}, false);
    expect(await controller.submissions(req(), {} as any)).toEqual({ obj: {}, status: 401 });
    expect(await controller.approve(req(), {} as any)).toEqual({ obj: {}, status: 401 });
    expect(await controller.remove(req({ reason: "policy" }), {} as any)).toEqual({ obj: {}, status: 401 });
  });

  it("approves a pending submission through PublishHelper", async () => {
    const { controller } = adminController();
    expect(await controller.approve(req({ note: "ok" }), {} as any)).toEqual({ status: "approved", assetId: "asset000001" });
    expect(PublishHelper.approve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "sub00000001" }), expect.objectContaining({ id: "asset000001" }), "admin000001", "ok");
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
    repos.submission.loadById.mockResolvedValueOnce({ ...pending(), payload: { name: "Proposed", qualityDetail } });
    const detail: any = await controller.submission(req(), {} as any);
    expect(detail.qualityDetail).toEqual(qualityDetail);
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
