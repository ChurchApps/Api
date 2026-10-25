jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: jest.fn(() => null) } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { apiBibleKey: "test" } }));
jest.mock("axios", () => ({ get: jest.fn() }));

import axios from "axios";
import { ApiBibleHelper } from "../ApiBibleHelper.js";

describe("ApiBibleHelper.getVerseText", () => {
  const mockGet = (axios as any).get as jest.Mock;

  beforeEach(() => mockGet.mockReset());

  it("returns [] when the upstream payload has no content array", async () => {
    mockGet.mockResolvedValueOnce({ data: { data: {} } });
    await expect(ApiBibleHelper.getVerseText("KJV", "GEN.1.1", "GEN.1.2")).resolves.toEqual([]);
  });

  it("attaches HTTP status on axios failures", async () => {
    const err: any = new Error("Request failed with status code 400");
    err.response = { status: 400 };
    mockGet.mockRejectedValueOnce(err);
    await expect(ApiBibleHelper.getVerseText("KJV", "GEN.1.1", "GEN.1.2")).rejects.toMatchObject({ status: 400 });
  });
});

describe("ApiBibleHelper.getContent", () => {
  const mockGet = (axios as any).get as jest.Mock;

  beforeEach(() => mockGet.mockReset());

  it("returns the response body unchanged", async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [{ id: "x" }] } });
    await expect(ApiBibleHelper.getContent("https://example.test/bibles")).resolves.toEqual({ data: [{ id: "x" }] });
  });

  // api.bible sometimes hangs and answers 504 after ~29 s, which ran the Lambda into its 29 s limit.
  it("gives up on api.bible before the Lambda time limit", async () => {
    mockGet.mockResolvedValueOnce({ data: {} });
    await ApiBibleHelper.getContent("https://example.test/bibles");
    const timeout = mockGet.mock.calls[0][1]?.timeout;
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(15000);
  });

  it("reports a timed-out request as 504", async () => {
    const err: any = new Error("timeout of 15000ms exceeded");
    err.code = "ECONNABORTED";
    mockGet.mockRejectedValueOnce(err);
    await expect(ApiBibleHelper.getContent("https://example.test/bibles")).rejects.toMatchObject({ status: 504 });
  });
});
