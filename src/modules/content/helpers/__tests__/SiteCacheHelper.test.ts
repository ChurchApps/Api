jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock("../SubDomainHelper.js", () => ({ SubDomainHelper: { get: jest.fn() } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { b1AppRoot: "https://{subdomain}.b1.church" } }));

import axios from "axios";
import { SubDomainHelper } from "../SubDomainHelper.js";
import { SiteCacheHelper } from "../SiteCacheHelper.js";

const post = axios.post as jest.Mock;
const getSub = SubDomainHelper.get as jest.Mock;

describe("SiteCacheHelper.revalidate", () => {
  beforeEach(() => {
    post.mockReset();
    getSub.mockReset();
    post.mockResolvedValue({ status: 200 });
  });

  it("POSTs B1App /api/revalidate/{sdSlug} for the church subdomain", async () => {
    getSub.mockResolvedValue("onechurch");
    await SiteCacheHelper.revalidate("church1");
    expect(getSub).toHaveBeenCalledWith("church1");
    expect(post).toHaveBeenCalledWith("https://onechurch.b1.church/api/revalidate/onechurch", null, { timeout: 4000 });
  });

  it("does nothing without a churchId or subdomain", async () => {
    await SiteCacheHelper.revalidate("");
    getSub.mockResolvedValue("");
    await SiteCacheHelper.revalidate("church1");
    expect(post).not.toHaveBeenCalled();
  });

  it("swallows B1App errors so content saves still succeed", async () => {
    getSub.mockResolvedValue("onechurch");
    post.mockRejectedValue(new Error("timeout"));
    await expect(SiteCacheHelper.revalidate("church1")).resolves.toBeUndefined();
  });

  it("encodes the subdomain in the revalidate path", async () => {
    getSub.mockResolvedValue("one church");
    await SiteCacheHelper.revalidate("church1");
    expect(post).toHaveBeenCalledWith("https://one church.b1.church/api/revalidate/one%20church", null, { timeout: 4000 });
  });
});
