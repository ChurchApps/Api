jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../../../shared/webhooks/UrlValidator.js", () => ({ UrlValidator: { validate: jest.fn(async () => null), isPrivateIp: jest.fn(() => false) } }));

import axios from "axios";
import { DomainHealthHelper } from "../DomainHealthHelper";
import { SafeHttp } from "../../../../shared/webhooks/SafeHttp";

describe("DomainHealthHelper.verifyDomain", () => {
  beforeEach(() => {
    (axios.get as jest.Mock).mockReset().mockResolvedValue({ headers: { "content-type": "application/json" }, data: { error: "no challenge" } });
  });

  it("checks the church's domain without following redirects", async () => {
    await DomainHealthHelper.verifyDomain("www.example.org");

    const config = (axios.get as jest.Mock).mock.calls[0][1];
    expect(config.maxRedirects).toBe(0);
  });

  it("checks the address actually connected to, not just the pre-flight lookup", async () => {
    await DomainHealthHelper.verifyDomain("www.example.org");

    const config = (axios.get as jest.Mock).mock.calls[0][1];
    expect(config.lookup).toBe(SafeHttp.guardedLookup);
  });

  it("still reports a domain served by our proxy as valid", async () => {
    expect(await DomainHealthHelper.verifyDomain("www.example.org")).toBe(true);
  });
});
