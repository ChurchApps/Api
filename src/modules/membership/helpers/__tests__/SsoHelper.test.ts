jest.mock("@churchapps/apihelper", () => ({
  FileStorageHelper: { store: jest.fn(), remove: jest.fn() },
  AwsHelper: { S3Read: jest.fn() }
}));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: {} }));
jest.mock("../UserChurchHelper.js", () => ({ UserChurchHelper: { createForNewUser: jest.fn() } }));

import jwt from "jsonwebtoken";
import { SsoHelper } from "../SsoHelper.js";
import { UserChurchHelper } from "../UserChurchHelper.js";
import { Environment } from "../../../../shared/helpers/Environment.js";

beforeAll(() => {
  Environment.jwtSecret = "test-secret";
  Environment.ssoAllowedOrigins = "https://myapp.com";
});

describe("SsoHelper state JWT", () => {
  it("round-trips a valid state token", () => {
    const token = SsoHelper.createState("https://church.b1.church/login");
    const payload = SsoHelper.verifyState(token);
    expect(payload?.returnUrl).toBe("https://church.b1.church/login");
    expect(typeof payload?.nonce).toBe("string");
    expect(payload?.nonce.length).toBeGreaterThan(0);
  });

  it("rejects a tampered token", () => {
    const token = SsoHelper.createState("https://church.b1.church/login");
    const tampered = token.slice(0, -3) + (token.slice(-3) === "AAA" ? "BBB" : "AAA");
    expect(SsoHelper.verifyState(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign({ returnUrl: "https://church.b1.church/x", nonce: "n" }, Environment.jwtSecret, { expiresIn: "-10s" });
    expect(SsoHelper.verifyState(expired)).toBeNull();
  });

  it("rejects a token signed with the wrong secret", () => {
    const forged = jwt.sign({ returnUrl: "https://church.b1.church/x", nonce: "n" }, "wrong-secret");
    expect(SsoHelper.verifyState(forged)).toBeNull();
  });
});

describe("SsoHelper.validateReturnUrl", () => {
  it("rejects an untrusted origin", async () => {
    expect(await SsoHelper.validateReturnUrl("https://evil.com/login")).toBe(false);
  });

  it("accepts *.b1.church hosts", async () => {
    expect(await SsoHelper.validateReturnUrl("https://grace.b1.church/login")).toBe(true);
    expect(await SsoHelper.validateReturnUrl("https://b1.church/login")).toBe(true);
  });

  it("accepts localhost on any port", async () => {
    expect(await SsoHelper.validateReturnUrl("http://localhost:3101/login")).toBe(true);
    expect(await SsoHelper.validateReturnUrl("http://127.0.0.1:8080/x")).toBe(true);
  });

  it("accepts a configured SSO_ALLOWED_ORIGINS entry", async () => {
    expect(await SsoHelper.validateReturnUrl("https://myapp.com/login?foo=1")).toBe(true);
  });

  it("rejects non-http(s) protocols and garbage", async () => {
    expect(await SsoHelper.validateReturnUrl("ftp://grace.b1.church/x")).toBe(false);
    expect(await SsoHelper.validateReturnUrl("not a url")).toBe(false);
    expect(await SsoHelper.validateReturnUrl("")).toBe(false);
  });

  it("rejects a church-domains-table host that is not in SSO_ALLOWED_ORIGINS", async () => {
    // The domains table is populated without ownership/DNS verification, so it is no longer trusted.
    expect(await SsoHelper.validateReturnUrl("https://custom.org/login")).toBe(false);
  });

  it("accepts a church-domains-table host only once it is in SSO_ALLOWED_ORIGINS", async () => {
    const prev = Environment.ssoAllowedOrigins;
    Environment.ssoAllowedOrigins = "https://custom.org";
    try {
      expect(await SsoHelper.validateReturnUrl("https://custom.org/login")).toBe(true);
    } finally {
      Environment.ssoAllowedOrigins = prev;
    }
  });
});

describe("SsoHelper.checkEmailTrust", () => {
  it("accepts a verified Google email", () => {
    expect(SsoHelper.checkEmailTrust("google", { email: "A@Example.com", email_verified: true })).toEqual({ ok: true, email: "a@example.com" });
  });

  it("rejects an unverified Google email", () => {
    const result = SsoHelper.checkEmailTrust("google", { email: "a@example.com", email_verified: false });
    expect(result.ok).toBe(false);
  });

  it("accepts a Microsoft consumer-tenant email", () => {
    const result = SsoHelper.checkEmailTrust("microsoft", { email: "a@outlook.com", tid: "9188040d-6c67-4c5b-b112-36a304b66dad" });
    expect(result).toEqual({ ok: true, email: "a@outlook.com" });
  });

  it("rejects a Microsoft foreign-tenant email without xms_edov", () => {
    const result = SsoHelper.checkEmailTrust("microsoft", { email: "a@corp.com", tid: "some-other-tenant" });
    expect(result.ok).toBe(false);
  });

  it("accepts a Microsoft foreign-tenant email when xms_edov is true", () => {
    const result = SsoHelper.checkEmailTrust("microsoft", { email: "a@corp.com", tid: "some-other-tenant", xms_edov: true });
    expect(result).toEqual({ ok: true, email: "a@corp.com" });
  });

  it("uses the email claim (not preferred_username/UPN) when trusting via xms_edov", () => {
    const result = SsoHelper.checkEmailTrust("microsoft", { email: "real@corp.com", preferred_username: "upn@corp.com", tid: "some-other-tenant", xms_edov: true });
    expect(result).toEqual({ ok: true, email: "real@corp.com" });
  });

  it("rejects an xms_edov account with no email claim (UPN alone is not trusted)", () => {
    const result = SsoHelper.checkEmailTrust("microsoft", { preferred_username: "upn@corp.com", tid: "some-other-tenant", xms_edov: true });
    expect(result.ok).toBe(false);
  });

  it("rejects when no email claim is present", () => {
    expect(SsoHelper.checkEmailTrust("google", { email_verified: true }).ok).toBe(false);
  });
});

describe("SsoHelper.fetchProviderPhoto", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  const mockRes = (contentType: string, bytes: number, contentLength?: string): any => ({
    ok: true,
    status: 200,
    headers: {
      get: (h: string) => {
        const key = h.toLowerCase();
        if (key === "content-type") return contentType;
        if (key === "content-length") return contentLength ?? String(bytes);
        return null;
      }
    },
    arrayBuffer: async () => new Uint8Array(bytes).buffer
  });

  it("rejects a non-image content-type", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockRes("text/html", 100)) as any;
    expect(await SsoHelper.fetchProviderPhoto("google", { picture: "https://x/p.jpg" })).toBeNull();
  });

  it("rejects a photo over the size cap", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockRes("image/jpeg", 3 * 1024 * 1024)) as any;
    expect(await SsoHelper.fetchProviderPhoto("google", { picture: "https://x/p.jpg" })).toBeNull();
  });

  it("rejects a photo whose declared content-length exceeds the cap", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockRes("image/jpeg", 1024, String(3 * 1024 * 1024))) as any;
    expect(await SsoHelper.fetchProviderPhoto("google", { picture: "https://x/p.jpg" })).toBeNull();
  });

  it("accepts a valid image within the cap", async () => {
    global.fetch = jest.fn().mockResolvedValue(mockRes("image/png", 1024)) as any;
    const result = await SsoHelper.fetchProviderPhoto("google", { picture: "https://x/p.png" });
    expect(result).toMatch(/^data:image\/png;base64,/);
  });
});

describe("SsoHelper.extractNames", () => {
  it("prefers given_name/family_name", () => {
    expect(SsoHelper.extractNames({ given_name: "Jane", family_name: "Doe", name: "ignored" })).toEqual({ firstName: "Jane", lastName: "Doe" });
  });

  it("falls back to splitting name", () => {
    expect(SsoHelper.extractNames({ name: "Jane Q Doe" })).toEqual({ firstName: "Jane", lastName: "Q Doe" });
  });
});

describe("SsoHelper.findOrCreateUser", () => {
  const createForNewUser = UserChurchHelper.createForNewUser as jest.Mock;
  beforeEach(() => createForNewUser.mockReset().mockResolvedValue(undefined));

  it("returns an existing user without creating", async () => {
    const existing = { id: "u1", email: "a@example.com" };
    const repos: any = { user: { loadByEmail: jest.fn().mockResolvedValue(existing), save: jest.fn() } };

    const result = await SsoHelper.findOrCreateUser("A@Example.com", "Jane", "Doe", repos);

    expect(result).toEqual({ user: existing, isNew: false });
    expect(repos.user.save).not.toHaveBeenCalled();
    expect(createForNewUser).not.toHaveBeenCalled();
  });

  it("creates a normalized user and links matching people when none exists", async () => {
    const repos: any = {
      user: {
        loadByEmail: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockImplementation(async (u: any) => ({ ...u, id: "new1" }))
      }
    };

    const result = await SsoHelper.findOrCreateUser("New@Example.com", "New", "User", repos);

    expect(result.isNew).toBe(true);
    expect(result.user.id).toBe("new1");
    expect(result.user.email).toBe("new@example.com");
    expect(result.user.password).toBeTruthy();
    expect(result.user.authGuid).toBeTruthy();
    expect(createForNewUser).toHaveBeenCalledWith("new1", "new@example.com");
  });
});

describe("SsoHelper.appendParam", () => {
  it("adds a query string when none exists", () => {
    expect(SsoHelper.appendParam("https://x.b1.church/login", "jwt", "abc")).toBe("https://x.b1.church/login?jwt=abc");
  });

  it("appends to an existing query string and encodes the value", () => {
    expect(SsoHelper.appendParam("https://x.b1.church/login?a=1", "loginError", "bad thing")).toBe("https://x.b1.church/login?a=1&loginError=bad%20thing");
  });
});

describe("SsoHelper.configuredProviders", () => {
  afterEach(() => {
    Environment.googleSsoClientId = "";
    Environment.googleSsoClientSecret = "";
    Environment.microsoftSsoClientId = "";
    Environment.microsoftSsoClientSecret = "";
  });

  it("lists only providers with both id and secret set", () => {
    Environment.googleSsoClientId = "gid";
    Environment.googleSsoClientSecret = "gsecret";
    expect(SsoHelper.configuredProviders()).toEqual(["google"]);
  });

  it("returns an empty array when nothing is configured", () => {
    expect(SsoHelper.configuredProviders()).toEqual([]);
  });
});
