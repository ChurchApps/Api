jest.mock("../Environment.js", () => ({ Environment: {} }));
import { Environment } from "../Environment.js";
import { AppUrlHelper } from "../AppUrlHelper.js";

describe("AppUrlHelper.b1AppUrl", () => {
  afterEach(() => { delete Environment.b1AppRoot; });

  it("fills the church subdomain into the hosted template", () => {
    Environment.b1AppRoot = "https://{subdomain}.b1.church";
    expect(AppUrlHelper.b1AppUrl("grace")).toBe("https://grace.b1.church");
  });

  it("falls back to the hosted domain when B1APP_ROOT is unset", () => {
    expect(AppUrlHelper.b1AppUrl("grace")).toBe("https://grace.b1.church");
  });

  it("uses a bare origin as-is on a self-hosted install, without a trailing slash", () => {
    Environment.b1AppRoot = "https://mychurch.example.org/";
    expect(AppUrlHelper.b1AppUrl("church")).toBe("https://mychurch.example.org");
  });
});
