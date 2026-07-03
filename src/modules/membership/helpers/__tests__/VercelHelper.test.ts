jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), delete: jest.fn() } }));
jest.mock("../../../../shared/helpers/index.js", () => ({ Environment: { vercelToken: "", vercelProjectId: "", vercelTeamId: "" } }));

import Axios from "axios";
import { Environment } from "../../../../shared/helpers/index.js";
import { VercelHelper } from "../VercelHelper.js";

const post = (Axios as any).post as jest.Mock;
const del = (Axios as any).delete as jest.Mock;

describe("VercelHelper", () => {
  beforeEach(() => {
    post.mockReset();
    del.mockReset();
    (Environment as any).vercelToken = "tok";
    (Environment as any).vercelProjectId = "proj";
    (Environment as any).vercelTeamId = "";
  });

  it("no-ops when unconfigured", async () => {
    (Environment as any).vercelToken = "";
    await VercelHelper.addDomain("example.org");
    await VercelHelper.removeDomain("example.org");
    expect(post).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("addDomain posts the apex then a www redirect (lowercased/trimmed)", async () => {
    post.mockResolvedValue({});
    await VercelHelper.addDomain("  Example.org ");
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][1]).toEqual({ name: "example.org" });
    expect(post.mock.calls[1][1]).toEqual({ name: "www.example.org", redirect: "example.org" });
  });

  it("skips www.* input on add", async () => {
    await VercelHelper.addDomain("www.example.org");
    expect(post).not.toHaveBeenCalled();
  });

  it("swallows a 409 already-added on add", async () => {
    post.mockRejectedValue({ response: { status: 409 } });
    await expect(VercelHelper.addDomain("example.org")).resolves.toBeUndefined();
  });

  it("rethrows non-409 errors on add", async () => {
    post.mockRejectedValue({ response: { status: 500 } });
    await expect(VercelHelper.addDomain("example.org")).rejects.toBeDefined();
  });

  it("removeDomain deletes apex and www, swallowing 404", async () => {
    del.mockRejectedValue({ response: { status: 404 } });
    await expect(VercelHelper.removeDomain("Example.org")).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledTimes(2);
    const urls = del.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.endsWith("/domains/example.org"))).toBe(true);
    expect(urls.some((u) => u.includes("/domains/www.example.org"))).toBe(true);
  });

  it("skips www.* input on remove", async () => {
    await VercelHelper.removeDomain("www.example.org");
    expect(del).not.toHaveBeenCalled();
  });

  it("includes the teamId query string when configured", async () => {
    (Environment as any).vercelTeamId = "team_1";
    post.mockResolvedValue({});
    await VercelHelper.addDomain("example.org");
    expect(post.mock.calls[0][0]).toContain("teamId=team_1");
  });
});
