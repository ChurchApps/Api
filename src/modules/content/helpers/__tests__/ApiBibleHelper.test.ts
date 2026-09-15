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
