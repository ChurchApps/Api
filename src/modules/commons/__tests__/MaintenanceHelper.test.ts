import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../helpers/PublishHelper", () => ({ PublishHelper: { discardProposed: jest.fn(async () => {}) } }));
jest.mock("../helpers/CommonsMailHelper", () => ({ CommonsMailHelper: { notifyReviewerDigest: jest.fn(async () => {}) } }));

import { MaintenanceHelper } from "../helpers/MaintenanceHelper";
import { CommonsMailHelper } from "../helpers/CommonsMailHelper";
import { PublishHelper } from "../helpers/PublishHelper";

function repos(overrides: any = {}) {
  const r: any = {
    asset: { pruneDownloads: jest.fn(async () => 2), loadById: jest.fn(async () => ({ id: "asset000001", status: "pending" })) },
    submission: {
      loadStaleDrafts: jest.fn(async () => []),
      countByStatus: jest.fn(async () => 0),
      countPendingOlderThan: jest.fn(async () => 0)
    }
  };
  for (const [k, v] of Object.entries(overrides)) Object.assign(r[k], v);
  return r;
}

describe("MaintenanceHelper.nightly", () => {
  beforeEach(() => jest.clearAllMocks());

  it("skips the reviewer digest when the pending queue is empty", async () => {
    const r = repos();
    const result = await MaintenanceHelper.nightly(r);
    expect(result).toEqual({ prunedDownloads: 2, deletedDrafts: 0 });
    expect(CommonsMailHelper.notifyReviewerDigest).not.toHaveBeenCalled();
    expect(r.submission.countPendingOlderThan).not.toHaveBeenCalled();
  });

  it("emails a digest with the pending count and how many are older than 72h", async () => {
    const r = repos({ submission: { countByStatus: jest.fn(async () => 3), countPendingOlderThan: jest.fn(async () => 1) } });
    await MaintenanceHelper.nightly(r);
    expect(r.submission.countByStatus).toHaveBeenCalledWith("pending");
    expect(r.submission.countPendingOlderThan).toHaveBeenCalledWith(72);
    expect(CommonsMailHelper.notifyReviewerDigest).toHaveBeenCalledWith(3, 1);
  });

  it("still prunes drafts when the digest throws", async () => {
    (CommonsMailHelper.notifyReviewerDigest as jest.Mock).mockRejectedValueOnce(new Error("ses down"));
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const r = repos({
      submission: {
        loadStaleDrafts: jest.fn(async () => [{ id: "sub00000009", assetId: "asset000001" }]),
        countByStatus: jest.fn(async () => 1),
        countPendingOlderThan: jest.fn(async () => 0)
      }
    });
    const result = await MaintenanceHelper.nightly(r);
    expect(result.deletedDrafts).toBe(1);
    expect(PublishHelper.discardProposed).toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
