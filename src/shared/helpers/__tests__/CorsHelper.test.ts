import { CorsHelper } from "../CorsHelper.js";

afterEach(() => {
  CorsHelper.setDomainLookup(null);
});

describe("CorsHelper.resolveOrigin", () => {
  it("defaults to * in local/dev", () => {
    expect(CorsHelper.resolveOrigin("dev")).toBe("*");
    expect(CorsHelper.resolveOrigin("development")).toBe("*");
    expect(CorsHelper.resolveOrigin("docker")).toBe("*");
    expect(CorsHelper.resolveOrigin("local")).toBe("*");
    expect(CorsHelper.resolveOrigin("dev", "*")).toBe("*");
  });

  it("defaults to the B1/churchapps allow-list when unset in non-dev", () => {
    expect(CorsHelper.resolveOrigin("prod")).toBe(CorsHelper.DEFAULT_ORIGINS);
    expect(CorsHelper.resolveOrigin("staging")).toBe(CorsHelper.DEFAULT_ORIGINS);
    expect(CorsHelper.resolveOrigin("demo")).toBe(CorsHelper.DEFAULT_ORIGINS);
  });

  it("fails startup in prod when CORS_ORIGIN is * or empty", () => {
    expect(() => CorsHelper.resolveOrigin("prod", "*")).toThrow("explicit allow-list");
    expect(() => CorsHelper.resolveOrigin("prod", "")).toThrow("explicit allow-list");
    expect(() => CorsHelper.resolveOrigin("prod", "   ")).toThrow("explicit allow-list");
    expect(() => CorsHelper.resolveOrigin("production", "*")).toThrow("explicit allow-list");
  });

  it("rejects * in non-dev even when mixed with other origins", () => {
    expect(() => CorsHelper.resolveOrigin("staging", "*")).toThrow("only allowed in local/dev");
    expect(() => CorsHelper.resolveOrigin("demo", "https://b1.church,*")).toThrow("only allowed in local/dev");
  });

  it("keeps an explicit allow-list", () => {
    expect(CorsHelper.resolveOrigin("prod", "https://admin.b1.church,https://*.b1.church")).toBe("https://admin.b1.church,https://*.b1.church");
    expect(CorsHelper.resolveOrigin("dev", "https://localhost:3000")).toBe("https://localhost:3000");
  });
});

describe("CorsHelper.isOriginAllowed", () => {
  const allowed = CorsHelper.parseOrigins(CorsHelper.DEFAULT_ORIGINS);

  it("allows a listed origin", () => {
    expect(CorsHelper.isOriginAllowed("https://admin.b1.church", allowed)).toBe(true);
    expect(CorsHelper.isOriginAllowed("https://grace.b1.church", allowed)).toBe(true);
    expect(CorsHelper.isOriginAllowed("https://admin.staging.b1.church", allowed)).toBe(true);
    expect(CorsHelper.isOriginAllowed("https://b1.church", allowed)).toBe(true);
    expect(CorsHelper.isOriginAllowed("https://lessons.church", allowed)).toBe(true);
    expect(CorsHelper.isOriginAllowed("https://app.lessons.church", allowed)).toBe(true);
    expect(CorsHelper.isOriginAllowed("https://app.chums.org", allowed)).toBe(true);
  });

  it("rejects an unknown origin", () => {
    expect(CorsHelper.isOriginAllowed("https://evil.com", allowed)).toBe(false);
    expect(CorsHelper.isOriginAllowed("https://evilb1.church", allowed)).toBe(false);
    expect(CorsHelper.isOriginAllowed("https://b1.church.evil.com", allowed)).toBe(false);
    expect(CorsHelper.isOriginAllowed("http://admin.b1.church", allowed)).toBe(false);
  });

  it("allows missing origin and *", () => {
    expect(CorsHelper.isOriginAllowed(undefined, allowed)).toBe(true);
    expect(CorsHelper.isOriginAllowed("https://evil.com", ["*"])).toBe(true);
  });
});

describe("CorsHelper.customDomainHostname", () => {
  it("accepts a plain https origin", () => {
    expect(CorsHelper.customDomainHostname("https://gracechurch.org")).toBe("gracechurch.org");
    expect(CorsHelper.customDomainHostname("https://WWW.GraceChurch.org")).toBe("www.gracechurch.org");
  });

  it("rejects non-https, non-default ports and malformed hosts", () => {
    expect(CorsHelper.customDomainHostname("http://gracechurch.org")).toBeNull();
    expect(CorsHelper.customDomainHostname("https://gracechurch.org:8443")).toBeNull();
    expect(CorsHelper.customDomainHostname("https://localhost")).toBeNull();
    expect(CorsHelper.customDomainHostname("https://10.0.0.5")).toBeNull();
    expect(CorsHelper.customDomainHostname("not-a-url")).toBeNull();
    expect(CorsHelper.customDomainHostname("")).toBeNull();
  });
});

describe("CorsHelper custom church domains", () => {
  const allowed = CorsHelper.parseOrigins(CorsHelper.DEFAULT_ORIGINS);

  it("allows an origin registered in the domains table", async () => {
    CorsHelper.setDomainLookup(async (host) => host === "gracechurch.org");
    expect(await CorsHelper.isOriginAllowedAsync("https://gracechurch.org", allowed)).toBe(true);
    expect(await CorsHelper.isOriginAllowedAsync("https://other.org", allowed)).toBe(false);
  });

  it("never consults the database for a first-party origin", async () => {
    const lookup = jest.fn(async () => true);
    CorsHelper.setDomainLookup(lookup);
    expect(await CorsHelper.isOriginAllowedAsync("https://admin.b1.church", allowed)).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("does not look up http or odd-port origins", async () => {
    const lookup = jest.fn(async () => true);
    CorsHelper.setDomainLookup(lookup);
    expect(await CorsHelper.isOriginAllowedAsync("http://gracechurch.org", allowed)).toBe(false);
    expect(await CorsHelper.isOriginAllowedAsync("https://gracechurch.org:8443", allowed)).toBe(false);
    expect(await CorsHelper.isOriginAllowedAsync("null", allowed)).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("caches hits and misses instead of querying per request", async () => {
    const lookup = jest.fn(async (host: string) => host === "gracechurch.org");
    CorsHelper.setDomainLookup(lookup);
    await CorsHelper.isOriginAllowedAsync("https://gracechurch.org", allowed);
    await CorsHelper.isOriginAllowedAsync("https://gracechurch.org", allowed);
    await CorsHelper.isOriginAllowedAsync("https://evil.com", allowed);
    await CorsHelper.isOriginAllowedAsync("https://evil.com", allowed);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the lookup throws", async () => {
    CorsHelper.setDomainLookup(async () => { throw new Error("db down"); });
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await CorsHelper.isOriginAllowedAsync("https://gracechurch.org", allowed)).toBe(false);
    error.mockRestore();
  });
});

describe("CorsHelper.buildOptions", () => {
  it("disables credentials when origin is *", () => {
    expect(CorsHelper.buildOptions("*").credentials).toBe(false);
  });

  it("enables credentials for an allow-list", () => {
    expect(CorsHelper.buildOptions(CorsHelper.DEFAULT_ORIGINS).credentials).toBe(true);
  });

  const callOrigin = (options: import("cors").CorsOptions, origin?: string) => {
    const originFn = options.origin as (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void;
    return new Promise<{ err: Error | null; allow?: boolean }>((resolve) => {
      originFn(origin, (err, allow) => resolve({ err, allow }));
    });
  };

  it("accepts a listed origin and rejects an unknown one", async () => {
    const options = CorsHelper.buildOptions(CorsHelper.DEFAULT_ORIGINS);
    const ok = await callOrigin(options, "https://admin.b1.church");
    expect(ok.err).toBeNull();
    expect(ok.allow).toBe(true);

    const bad = await callOrigin(options, "https://evil.com");
    expect(bad.err).toBeInstanceOf(Error);
    expect(bad.err?.message).toBe("Not allowed by CORS");
  });

  it("accepts a registered custom church domain", async () => {
    CorsHelper.setDomainLookup(async (host) => host === "gracechurch.org");
    const options = CorsHelper.buildOptions(CorsHelper.DEFAULT_ORIGINS);
    const ok = await callOrigin(options, "https://gracechurch.org");
    expect(ok.err).toBeNull();
    expect(ok.allow).toBe(true);
  });
});

describe("CorsHelper.applyOriginHeaders", () => {
  const header = () => {
    const headers: Record<string, string> = {};
    return { headers, header: (name: string, value: string) => { headers[name] = value; } };
  };

  it("reflects a listed origin and never sets * with credentials", async () => {
    const res = header();
    await CorsHelper.applyOriginHeaders(res, "https://admin.b1.church", CorsHelper.DEFAULT_ORIGINS);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://admin.b1.church");
    expect(res.headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(res.headers["Vary"]).toBe("Origin");
  });

  it("reflects a registered custom church domain", async () => {
    CorsHelper.setDomainLookup(async (host) => host === "gracechurch.org");
    const res = header();
    await CorsHelper.applyOriginHeaders(res, "https://gracechurch.org", CorsHelper.DEFAULT_ORIGINS);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://gracechurch.org");
    expect(res.headers["Access-Control-Allow-Credentials"]).toBe("true");
  });

  it("does not set origin headers for an unknown origin", async () => {
    CorsHelper.setDomainLookup(async () => false);
    const res = header();
    await CorsHelper.applyOriginHeaders(res, "https://evil.com", CorsHelper.DEFAULT_ORIGINS);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(res.headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("sets * without credentials in dev wildcard mode", async () => {
    const res = header();
    await CorsHelper.applyOriginHeaders(res, undefined, "*");
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res.headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });
});
