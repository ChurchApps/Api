import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { settings: { edit: "settingsEdit" }, server: { admin: "serverAdmin" } },
  UniqueIdHelper: { shortId: () => "short", secret: () => "a".repeat(64) },
  UserHelper: { loadExpandedPermissions: jest.fn(async () => []) }
}));
jest.mock("../../auth/index", () => ({ AuthenticatedUser: { getCombinedApiJwt: jest.fn() } }));
jest.mock("../../models/index", () => ({}));
jest.mock("../../repositories/index", () => ({
  OAuthDeviceCodeRepo: { generateDeviceCode: () => "dc", generateUserCode: () => "uc" },
  OAuthRelaySessionRepo: { generateSessionCode: () => "sc" }
}));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { membershipApi: "https://api.example", b1AdminRoot: "https://admin.example" } }));
jest.mock("../../../../shared/auth/Scopes.js", () => ({ parseScopes: () => [] }));
jest.mock("../../helpers/OAuthConnectionHelper.js", () => ({ toConnections: (rows: any) => rows }));

import { OAuthController } from "../OAuthController.js";

function oauthController(opts: any = {}) {
  const repos: any = {
    oAuthRelaySession: {
      loadBySessionCode: jest.fn(async () => opts.session ?? null),
      save: jest.fn(async (s: any) => s),
      delete: jest.fn()
    }
  };
  const controller = new OAuthController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

function htmlRes() {
  let body = "";
  const res: any = {
    setHeader: jest.fn(),
    send: jest.fn((html: string) => { body = html; return html; })
  };
  return { res, getBody: () => body };
}

describe("OAuthController.relayCallback", () => {
  it("does not return a script-shaped error query raw in HTML", async () => {
    const { controller } = oauthController();
    const { res, getBody } = htmlRes();
    const payload = "<script>alert(1)</script>";
    await (controller as any).relayCallback({ query: { error: payload } }, res);
    const html = getBody();
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html");
    expect(html).not.toContain(payload);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Authorization Error");
  });

  it("still shows a provider error code after escaping", async () => {
    const { controller } = oauthController();
    const { res, getBody } = htmlRes();
    await (controller as any).relayCallback({ query: { error: "access_denied" } }, res);
    expect(getBody()).toContain("access_denied");
    expect(getBody()).toContain("Authorization Error");
  });

  it("completes a real relay callback and shows the success page", async () => {
    const session = { id: "s1", sessionCode: "abc", status: "pending" };
    const { controller, repos } = oauthController({ session });
    const { res, getBody } = htmlRes();
    await (controller as any).relayCallback({ query: { code: "auth-code", state: "abc" } }, res);
    expect(repos.oAuthRelaySession.save).toHaveBeenCalledWith(expect.objectContaining({ authCode: "auth-code", status: "completed" }));
    expect(getBody()).toContain("Success!");
    expect(getBody()).toContain("Authorization complete");
    expect(getBody()).not.toContain("<script>");
  });
});
