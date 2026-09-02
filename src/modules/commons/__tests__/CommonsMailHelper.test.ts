import "reflect-metadata";

const sendTransactional = jest.fn(async () => {});
jest.mock("../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: { sendTransactional } }));
const loadByIds = jest.fn(async () => [{ id: "user0000001", email: "writer@example.com" }]);
jest.mock("../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ user: { loadByIds } })) } }));
jest.mock("../../../shared/helpers/Environment.js", () => ({ Environment: { supportEmail: "support@churchapps.org", worshipCommonsRoot: "https://worshipcommons.org", b1AdminRoot: "https://admin.b1.church" } }));

import { CommonsMailHelper } from "../helpers/CommonsMailHelper.js";
import { TransactionalEmailHelper } from "../../../shared/helpers/TransactionalEmailHelper.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";

const sub = (): any => ({ id: "sub00000001", submittedBy: "user0000001", payload: { name: "New Hymn" } });

describe("CommonsMailHelper writer emails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadByIds.mockResolvedValue([{ id: "user0000001", email: "writer@example.com" }]);
  });

  it("emails the writer after a submission is received", async () => {
    await CommonsMailHelper.notifyReceived(sub());
    expect(RepoManager.getRepos).toHaveBeenCalledWith("membership");
    expect(loadByIds).toHaveBeenCalledWith(["user0000001"]);
    expect(TransactionalEmailHelper.sendTransactional).toHaveBeenCalledWith(
      "support@churchapps.org",
      "writer@example.com",
      "WorshipCommons",
      "https://worshipcommons.org",
      "We received New Hymn",
      expect.stringContaining("/my-songs")
    );
    const body = (TransactionalEmailHelper.sendTransactional as jest.Mock).mock.calls[0][5];
    expect(body).toContain("New Hymn");
    expect(body).toContain("human reviewer");
    expect(body).toContain("few days");
    expect(body).toContain("https://worshipcommons.org/my-songs");
  });

  it("emails the writer when a song is approved", async () => {
    await CommonsMailHelper.notifyApproved(sub(), "asset000001");
    expect(TransactionalEmailHelper.sendTransactional).toHaveBeenCalledWith(
      "support@churchapps.org",
      "writer@example.com",
      "WorshipCommons",
      "https://worshipcommons.org",
      "New Hymn is live on WorshipCommons",
      expect.stringContaining("https://worshipcommons.org/songs/asset000001")
    );
  });

  it("maps reject reasons and includes the reviewer note", async () => {
    await CommonsMailHelper.notifyRejected(sub(), "quality", "needs a chorus");
    const [from, to, app, url, subject, body] = (TransactionalEmailHelper.sendTransactional as jest.Mock).mock.calls[0];
    expect(from).toBe("support@churchapps.org");
    expect(to).toBe("writer@example.com");
    expect(app).toBe("WorshipCommons");
    expect(url).toBe("https://worshipcommons.org");
    expect(subject).toBe("An update on New Hymn");
    expect(body).toContain("didn't make the WorshipCommons library");
    expect(body).toContain("quality bar");
    expect(body).toContain("needs a chorus");
    expect(body).toContain("support@churchapps.org");
  });

  it.each([
    ["duplicate", "duplicate"],
    ["licensing", "licensing"],
    ["offtopic", "isn't a fit"],
    ["incomplete", "missing required"],
    ["other", "not to add it"]
  ])("maps %s to a human sentence", async (reason, snippet) => {
    await CommonsMailHelper.notifyRejected(sub(), reason);
    const body = (TransactionalEmailHelper.sendTransactional as jest.Mock).mock.calls[0][5];
    expect(body).toContain(snippet);
    expect(body).not.toContain("needs a chorus");
  });

  it("skips the email when the writer has no address", async () => {
    loadByIds.mockResolvedValueOnce([{ id: "user0000001" }]);
    await CommonsMailHelper.notifyReceived(sub());
    expect(TransactionalEmailHelper.sendTransactional).not.toHaveBeenCalled();
  });

  it("skips the email when membership has no user", async () => {
    loadByIds.mockResolvedValueOnce([]);
    await CommonsMailHelper.notifyApproved(sub(), "asset000001");
    expect(TransactionalEmailHelper.sendTransactional).not.toHaveBeenCalled();
  });

  it("does not fail the caller when mail throws", async () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    sendTransactional.mockRejectedValueOnce(new Error("ses down"));
    await expect(CommonsMailHelper.notifyReceived(sub())).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("CommonsMailHelper.notifyReviewerDigest", () => {
  beforeEach(() => jest.clearAllMocks());

  it("emails support when the pending queue is not empty", async () => {
    await CommonsMailHelper.notifyReviewerDigest(3, 1);
    expect(TransactionalEmailHelper.sendTransactional).toHaveBeenCalledWith(
      "support@churchapps.org",
      "support@churchapps.org",
      "WorshipCommons",
      "https://worshipcommons.org",
      "3 WorshipCommons submissions waiting",
      expect.stringMatching(/3 WorshipCommons submissions waiting.*1 older than 72 hours/)
    );
    const body = (TransactionalEmailHelper.sendTransactional as jest.Mock).mock.calls[0][5];
    expect(body).toContain("https://admin.b1.church/admin?tab=commons");
  });

  it("omits the stale clause when none are older than 72 hours", async () => {
    await CommonsMailHelper.notifyReviewerDigest(2, 0);
    const body = (TransactionalEmailHelper.sendTransactional as jest.Mock).mock.calls[0][5];
    expect(body).toContain("2 WorshipCommons submissions waiting");
    expect(body).not.toContain("72 hours");
  });

  it("skips the digest when the queue is empty", async () => {
    await CommonsMailHelper.notifyReviewerDigest(0, 0);
    expect(TransactionalEmailHelper.sendTransactional).not.toHaveBeenCalled();
  });
});

describe("CommonsMailHelper report emails", () => {
  const report = (over: any = {}): any => ({ id: "rep00000001", contentText: "Old Hymn", reason: "copyright", email: "reporter@example.com", ...over });

  beforeEach(() => {
    jest.clearAllMocks();
    loadByIds.mockResolvedValue([{ id: "owner000001", email: "publisher@example.com" }]);
  });

  it("acknowledges the reporter at the raw address on the report, with no user lookup", async () => {
    await CommonsMailHelper.notifyReportReceived(report());
    expect(RepoManager.getRepos).not.toHaveBeenCalled();
    const [from, to, app, url, subject, body] = (TransactionalEmailHelper.sendTransactional as jest.Mock).mock.calls[0];
    expect(from).toBe("support@churchapps.org");
    expect(to).toBe("reporter@example.com");
    expect(app).toBe("WorshipCommons");
    expect(url).toBe("https://worshipcommons.org");
    expect(subject).toBe("We received your report (rep00000001)");
    expect(body).toContain("Old Hymn");
    expect(body).toContain("rep00000001");
    expect(body).toContain("support@churchapps.org");
  });

  it("falls back to generic wording when the report has no content text", async () => {
    await CommonsMailHelper.notifyReportReceived(report({ contentText: "  " }));
    const body = (TransactionalEmailHelper.sendTransactional as jest.Mock).mock.calls[0][5];
    expect(body).toContain("the content you reported");
  });

  it.each([
    ["upheld", "agreed with your report"],
    ["dismissed", "no action was needed"],
    ["duplicate", "already received this report"]
  ])("tells the reporter the %s outcome", async (resolution, snippet) => {
    await CommonsMailHelper.notifyReportResolved(report({ resolutionNote: "removed at the writer's request" }), resolution);
    const [, to, , , subject, body] = (TransactionalEmailHelper.sendTransactional as jest.Mock).mock.calls[0];
    expect(to).toBe("reporter@example.com");
    expect(subject).toBe("Your report (rep00000001) is resolved");
    expect(body).toContain(snippet);
    expect(body).toContain("removed at the writer's request");
  });

  it("omits an empty resolution note", async () => {
    await CommonsMailHelper.notifyReportResolved(report({ resolutionNote: "   " }), "dismissed");
    const body = (TransactionalEmailHelper.sendTransactional as jest.Mock).mock.calls[0][5];
    expect(body).toContain("rep00000001");
    expect(body).not.toContain("<p>   </p>");
  });

  it.each(["notifyReportReceived", "notifyReportResolved"])("skips %s when the report has no email", async (method) => {
    await (CommonsMailHelper as any)[method](report({ email: undefined }), "upheld");
    expect(TransactionalEmailHelper.sendTransactional).not.toHaveBeenCalled();
  });

  it("emails the publisher when a report takes their song down", async () => {
    await CommonsMailHelper.notifyTakedown({ id: "asset000001", name: "Old Hymn", publisherUserId: "owner000001" }, report());
    expect(loadByIds).toHaveBeenCalledWith(["owner000001"]);
    const [, to, , , subject, body] = (TransactionalEmailHelper.sendTransactional as jest.Mock).mock.calls[0];
    expect(to).toBe("publisher@example.com");
    expect(subject).toBe("Old Hymn was taken down from WorshipCommons");
    expect(body).toContain("a copyright report");
    expect(body).toContain("counter-notice");
  });

  it("names a policy report in the takedown notice", async () => {
    await CommonsMailHelper.notifyTakedown({ id: "asset000001", name: "Old Hymn", publisherUserId: "owner000001" }, report({ reason: "policy" }));
    const body = (TransactionalEmailHelper.sendTransactional as jest.Mock).mock.calls[0][5];
    expect(body).toContain("a policy report");
  });

  it("skips the takedown notice when the asset has no publisher", async () => {
    await CommonsMailHelper.notifyTakedown({ id: "asset000001", name: "Old Hymn" }, report());
    expect(TransactionalEmailHelper.sendTransactional).not.toHaveBeenCalled();
  });

  it("does not fail the caller when a report email throws", async () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    sendTransactional.mockRejectedValueOnce(new Error("ses down"));
    await expect(CommonsMailHelper.notifyReportReceived(report())).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
