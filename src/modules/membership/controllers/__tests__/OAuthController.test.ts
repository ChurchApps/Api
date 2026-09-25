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
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { membershipApi: "https://api.example", b1AdminRoot: "https://admin.example", oauthAccessTokenSeconds: 10 } }));
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

describe("OAuthController access token TTL", () => {
  it("device grant expires_in matches Environment.oauthAccessTokenSeconds", async () => {
    const { AuthenticatedUser } = jest.requireMock("../../auth/index");
    AuthenticatedUser.getCombinedApiJwt.mockReturnValue("jwt");

    const repos: any = {
      oAuthDeviceCode: {
        loadByDeviceCode: jest.fn(async () => ({
          id: "d1",
          clientId: "c1",
          status: "approved",
          userChurchId: "uc1",
          scopes: "plans",
          planTypeId: "pt1",
          expiresAt: new Date(Date.now() + 60_000)
        })),
        delete: jest.fn()
      },
      userChurch: { load: jest.fn(async () => ({ id: "uc1", userId: "u1", churchId: "ch1", personId: "p1" })) },
      user: { load: jest.fn(async () => ({ id: "u1", email: "a@b.c" })) },
      church: { loadById: jest.fn(async () => ({ id: "ch1", churchName: "Demo", subDomain: "demo" })) },
      person: { loadByIdsOnly: jest.fn(async () => [{ membershipStatus: "Member" }]) },
      groupMember: { loadForPeople: jest.fn(async () => []) },
      oAuthToken: { save: jest.fn(async (t: any) => t) }
    };
    const controller = new OAuthController();
    (controller as any).repos = repos;
    (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
    let payload: any;
    (controller as any).json = (obj: any) => { payload = obj; return obj; };

    await controller.token({ body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: "dc", client_id: "c1" } } as any, {} as any);

    expect(payload.expires_in).toBe(10);
    expect(payload.plan_type_id).toBe("pt1");
    expect(AuthenticatedUser.getCombinedApiJwt).toHaveBeenCalledWith(expect.anything(), expect.anything(), 10, expect.anything());
  });
});

describe("OAuthController relay + device code hardening", () => {
  it("does not overwrite an already-completed relay session", async () => {
    const session = { id: "s1", sessionCode: "abc", status: "completed", authCode: "victim-code" };
    const { controller, repos } = oauthController({ session });
    const { res, getBody } = htmlRes();
    await (controller as any).relayCallback({ query: { code: "attacker-code", state: "abc" } }, res);
    expect(repos.oAuthRelaySession.save).not.toHaveBeenCalled();
    expect(getBody()).not.toContain("Success!");
  });

  function deviceController(dc: any) {
    const repos: any = {
      oAuthDeviceCode: { loadByUserCode: jest.fn(async () => dc), save: jest.fn() },
      userChurch: { loadByUserId: jest.fn(async () => ({ id: "uc1" })) }
    };
    const controller = new OAuthController();
    (controller as any).repos = repos;
    (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ id: "u1", churchId: "c1" });
    (controller as any).json = (obj: any, status: number) => ({ obj, status });
    return { controller, repos };
  }

  it("refuses to approve an expired device code", async () => {
    const { controller, repos } = deviceController({ id: "d1", status: "pending", expiresAt: new Date(Date.now() - 1000) });
    const result: any = await (controller as any).approveDevice({ body: { user_code: "ABCD", church_id: "c1" } }, {});
    expect(result.status).toBe(400);
    expect(repos.oAuthDeviceCode.save).not.toHaveBeenCalled();
  });

  it("approves a live device code", async () => {
    const { controller, repos } = deviceController({ id: "d1", status: "pending", expiresAt: new Date(Date.now() + 60000) });
    await (controller as any).approveDevice({ body: { user_code: "ABCD", church_id: "c1" } }, {});
    expect(repos.oAuthDeviceCode.save).toHaveBeenCalledWith(expect.objectContaining({ status: "approved", userChurchId: "uc1" }));
  });

  it("ignores deny on an expired device code", async () => {
    const { controller, repos } = deviceController({ id: "d1", status: "pending", expiresAt: new Date(Date.now() - 1000) });
    const result: any = await (controller as any).denyDevice({ body: { user_code: "ABCD" } }, {});
    expect(result.status).toBe(400);
    expect(repos.oAuthDeviceCode.save).not.toHaveBeenCalled();
  });
});
