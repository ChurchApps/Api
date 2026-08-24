import type { CorsOptions } from "cors";

// Resolves whether a bare hostname is a church's registered custom domain.
export type CustomDomainLookup = (hostname: string) => Promise<boolean>;

export class CorsHelper {
  static readonly DEFAULT_ORIGINS = "https://b1.church,https://*.b1.church,https://lessons.church,https://*.lessons.church,https://churchapps.org,https://*.churchapps.org,https://chums.org,https://*.chums.org,https://streaminglive.church,https://*.streaminglive.church,https://worshipcommons.org,https://*.worshipcommons.org";

  // Churches point their own domains at us and B1Admin records them in the `domains` table
  // (the same rows CaddyHelper turns into proxy routes). Those sites call this API with
  // credentials, so the first-party list above can't be the whole allow-list. Rather than
  // widening to *, reflect an origin only after confirming the host is a registered domain.
  static readonly DOMAIN_CACHE_TTL_MS = 5 * 60 * 1000;
  static readonly DOMAIN_MISS_CACHE_TTL_MS = 60 * 1000;
  static readonly DOMAIN_CACHE_MAX = 500;
  // Conservative hostname shape - keeps junk origins from reaching the database at all.
  private static readonly HOSTNAME_PATTERN = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

  private static domainCache = new Map<string, { allowed: boolean; expires: number }>();
  private static domainLookup: CustomDomainLookup | null = null;

  static isDevEnvironment(environment: string): boolean {
    const env = (environment || "").toLowerCase();
    return env === "dev" || env === "development" || env === "docker" || env === "local";
  }

  static isProdEnvironment(environment: string): boolean {
    const env = (environment || "").toLowerCase();
    return env === "prod" || env === "production";
  }

  static parseOrigins(corsOrigin: string): string[] {
    return (corsOrigin || "").split(",").map((o) => o.trim()).filter((o) => o.length > 0);
  }

  static resolveOrigin(environment: string, corsOriginEnv?: string): string {
    const isDev = this.isDevEnvironment(environment);
    const isProd = this.isProdEnvironment(environment);
    const raw = corsOriginEnv === undefined ? undefined : corsOriginEnv.trim();

    if (isProd && (raw === "*" || raw === "")) throw new Error("CORS_ORIGIN must be an explicit allow-list in production");

    if (raw === undefined || raw === "") return isDev ? "*" : this.DEFAULT_ORIGINS;

    const origins = this.parseOrigins(raw);
    if (origins.includes("*")) {
      if (!isDev) throw new Error("CORS_ORIGIN=* is only allowed in local/dev");
      return "*";
    }
    return raw;
  }

  // Static allow-list check only. Custom church domains need isOriginAllowedAsync.
  static isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
    if (!origin) return true;
    if (allowedOrigins.includes("*")) return true;
    return allowedOrigins.some((pattern) => this.matchesAllowedOrigin(origin, pattern));
  }

  static async isOriginAllowedAsync(origin: string | undefined, allowedOrigins: string[]): Promise<boolean> {
    if (this.isOriginAllowed(origin, allowedOrigins)) return true;
    const hostname = this.customDomainHostname(origin as string);
    if (!hostname) return false;
    return this.isRegisteredChurchDomain(hostname);
  }

  static matchesAllowedOrigin(origin: string, pattern: string): boolean {
    if (pattern === "*") return true;
    if (!pattern.includes("*")) return origin.toLowerCase() === pattern.toLowerCase();
    let originUrl: URL;
    let patternUrl: URL;
    try {
      originUrl = new URL(origin);
      patternUrl = new URL(pattern);
    } catch {
      return false;
    }
    if (originUrl.protocol !== patternUrl.protocol) return false;
    if (originUrl.port !== patternUrl.port) return false;
    const host = originUrl.hostname.toLowerCase();
    const patternHost = patternUrl.hostname.toLowerCase();
    if (!patternHost.startsWith("*.")) return false;
    const suffix = patternHost.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }

  // Church sites are only ever served over https on the default port, so anything else
  // is not a candidate for a domains-table lookup.
  static customDomainHostname(origin: string): string | null {
    if (!origin) return null;
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return null;
    }
    if (url.protocol !== "https:") return null;
    if (url.port !== "") return null;
    const hostname = url.hostname.toLowerCase();
    if (!this.HOSTNAME_PATTERN.test(hostname)) return null;
    // No real TLD is all digits, so this drops bare IPv4 literals.
    if (/^\d+$/.test(hostname.split(".").pop() as string)) return null;
    return hostname;
  }

  static async isRegisteredChurchDomain(hostname: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.domainCache.get(hostname);
    if (cached && cached.expires > now) return cached.allowed;

    let allowed: boolean;
    try {
      allowed = await (this.domainLookup ?? this.loadDomainFromDb)(hostname);
    } catch (error) {
      console.error("CORS custom domain lookup failed:", (error as any)?.message || error);
      // A database blip shouldn't flap a church's site offline; keep serving the last
      // known answer if we have one, otherwise fail closed.
      return cached?.allowed ?? false;
    }

    this.cacheDomain(hostname, allowed, now);
    return allowed;
  }

  static setDomainLookup(lookup: CustomDomainLookup | null): void {
    this.domainLookup = lookup;
    this.domainCache.clear();
  }

  static clearDomainCache(): void {
    this.domainCache.clear();
  }

  private static cacheDomain(hostname: string, allowed: boolean, now: number): void {
    // Map iterates in insertion order, so deleting first re-inserts as the newest entry
    // and the oldest is always the one evicted when the cache is full.
    this.domainCache.delete(hostname);
    if (this.domainCache.size >= this.DOMAIN_CACHE_MAX) {
      const oldest = this.domainCache.keys().next();
      if (!oldest.done) this.domainCache.delete(oldest.value);
    }
    const ttl = allowed ? this.DOMAIN_CACHE_TTL_MS : this.DOMAIN_MISS_CACHE_TTL_MS;
    this.domainCache.set(hostname, { allowed, expires: now + ttl });
  }

  // Dynamic import keeps shared/ from pulling the membership module into every consumer,
  // matching how RailwayCron and BaseController reach into modules.
  private static loadDomainFromDb: CustomDomainLookup = async (hostname: string) => {
    const { RepoManager } = await import("../infrastructure/RepoManager.js");
    const repos = await RepoManager.getRepos<any>("membership");
    // loadByName lowercases and retries without a leading "www." for us.
    const row = await repos.domain.loadByName(hostname);
    return !!row;
  };

  static buildOptions(corsOrigin: string): CorsOptions {
    const allowedOrigins = this.parseOrigins(corsOrigin);
    const allowWildcard = allowedOrigins.includes("*");
    return {
      origin: (origin, callback) => {
        this.isOriginAllowedAsync(origin, allowedOrigins)
          .then((allowed) => {
            if (allowed) callback(null, true);
            else callback(new Error("Not allowed by CORS"));
          })
          .catch(() => callback(new Error("Not allowed by CORS")));
      },
      credentials: !allowWildcard,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "X-Batch-Id"]
    };
  }

  static async applyOriginHeaders(res: { header: (name: string, value: string) => void }, origin: string | undefined, corsOrigin: string): Promise<void> {
    const allowedOrigins = this.parseOrigins(corsOrigin);
    if (!(await this.isOriginAllowedAsync(origin, allowedOrigins))) return;
    if (origin) res.header("Access-Control-Allow-Origin", origin);
    else if (allowedOrigins.includes("*")) res.header("Access-Control-Allow-Origin", "*");
    if (!allowedOrigins.includes("*")) {
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
    }
  }
}
