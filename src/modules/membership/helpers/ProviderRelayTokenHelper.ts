import crypto from "crypto";
import { getProvider, getProviderConfig, setProviderSecret, TokenHelper, ContentProviderConfig } from "@churchapps/content-providers";
import { LoginRateLimiter } from "./LoginRateLimiter.js";
import { OAuthRelaySession } from "../models/index.js";

// Same three assignments as applyContentProviderSecrets in doing/helpers/ProviderAuthHelper.ts.
// Repeated here so the membership relay does not import another module. Called per request because
// Environment.init may fill these env vars after the doing module's import-time call.
function applyContentProviderSecrets() {
  setProviderSecret("gocurriculum", process.env.GOCURRICULUM_CLIENT_SECRET || "");
  setProviderSecret("googledrive", process.env.GOOGLE_DRIVE_CLIENT_SECRET || "");
  setProviderSecret("onedrive", process.env.ONEDRIVE_CLIENT_SECRET || "");
}

// Confidential clients: the relay callback is a web redirect, so the token endpoint rejects
// PKCE-only exchanges. Dropbox and the other public clients are intentionally absent.
const SERVER_SECRET_PROVIDER_ENV: Record<string, string> = {
  onedrive: "ONEDRIVE_CLIENT_SECRET",
  googledrive: "GOOGLE_DRIVE_CLIENT_SECRET",
  gocurriculum: "GOCURRICULUM_CLIENT_SECRET"
};

const CODE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const CODE_CHALLENGE = /^[A-Za-z0-9\-_]{43,128}$/;
const RELAY_WINDOW_SECONDS = 900;

export interface RelayHttpResult {
  status: number;
  body: Record<string, unknown>;
  consume?: boolean;
}

export interface RelayExchangeReady {
  ready: true;
  providerId: string;
  authCode: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface RelayRefreshReady {
  ready: true;
  providerId: string;
  refreshToken: string;
}

type ProviderExchange = {
  exchangeCodeForTokens?: (code: string, codeVerifier: string, redirectUri: string) => Promise<Record<string, unknown> | null>;
};

export function isServerSecretProvider(providerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(SERVER_SECRET_PROVIDER_ENV, providerId);
}

export function isPkceCodeChallenge(value: unknown): value is string {
  return typeof value === "string" && CODE_CHALLENGE.test(value);
}

export function serverSecret(providerId: string): string {
  const envName = SERVER_SECRET_PROVIDER_ENV[providerId];
  return envName ? (process.env[envName] || "") : "";
}

function reject(status: number, error: string, errorDescription: string, consume = false): { ready: false; result: RelayHttpResult } {
  return { ready: false, result: { status, body: { error, error_description: errorDescription }, consume } };
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function pkceMatches(verifier: string, challenge: string): boolean {
  const actual = crypto.createHash("sha256").update(verifier).digest("base64url");
  return sameSecret(actual, challenge);
}

function expiresInSeconds(expiresAt?: Date | string): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((ms - Date.now()) / 1000));
}

function deviceTokens(tokens: Record<string, unknown> | null | undefined, fallbackRefresh: string) {
  if (!tokens?.access_token || typeof tokens.access_token !== "string") return null;
  return {
    access_token: tokens.access_token,
    refresh_token: (typeof tokens.refresh_token === "string" && tokens.refresh_token) || fallbackRefresh || "",
    token_type: (typeof tokens.token_type === "string" && tokens.token_type) || "Bearer",
    expires_in: typeof tokens.expires_in === "number" ? tokens.expires_in : 3600,
    scope: typeof tokens.scope === "string" ? tokens.scope : "",
    created_at: typeof tokens.created_at === "number" ? tokens.created_at : Math.floor(Date.now() / 1000)
  };
}

export function prepareRelayExchange(session: OAuthRelaySession | null, codeVerifier: unknown, presentedCode?: unknown): { ready: false; result: RelayHttpResult } | RelayExchangeReady {
  applyContentProviderSecrets();
  if (!session) return reject(404, "not_found", "Relay session not found or expired");
  if (typeof codeVerifier !== "string" || !CODE_VERIFIER.test(codeVerifier)) {
    return reject(400, "invalid_request", "codeVerifier must be a PKCE verifier");
  }
  const providerId = session.provider || "";
  if (!isServerSecretProvider(providerId)) {
    return reject(400, "unsupported_provider", "This provider exchanges on the device");
  }
  if (!serverSecret(providerId)) return reject(500, "server_error", "Provider secret is not configured");
  if (!session.codeChallenge || !isPkceCodeChallenge(session.codeChallenge)) {
    return reject(400, "invalid_request", "Relay session has no PKCE code challenge. Create the session with codeChallenge.");
  }
  if (!pkceMatches(codeVerifier, session.codeChallenge)) return reject(400, "invalid_grant", "codeVerifier does not match this relay session");
  if (session.status === "expired") return reject(400, "invalid_grant", "Authorization code already used");
  if (session.status !== "completed") {
    return { ready: false, result: { status: 200, body: { status: session.status || "pending", expiresIn: expiresInSeconds(session.expiresAt) } } };
  }
  if (!session.authCode) return reject(400, "invalid_grant", "Relay session has no authorization code", true);
  if (presentedCode != null && presentedCode !== "") {
    if (typeof presentedCode !== "string" || presentedCode.length > 512 || !sameSecret(presentedCode, session.authCode)) {
      return reject(400, "invalid_grant", "code does not match the authorization code captured for this relay session");
    }
  }
  if (!session.redirectUri) return reject(400, "invalid_request", "Relay session has no redirect URI");
  return { ready: true, providerId, authCode: session.authCode, redirectUri: session.redirectUri, codeVerifier };
}

export async function runRelayExchange(ready: RelayExchangeReady): Promise<RelayHttpResult> {
  applyContentProviderSecrets();
  const provider = getProvider(ready.providerId) as ProviderExchange | null;
  if (!provider?.exchangeCodeForTokens) return { status: 500, body: { error: "server_error", error_description: "Provider is not available" } };
  let tokens: Record<string, unknown> | null = null;
  try {
    tokens = await provider.exchangeCodeForTokens(ready.authCode, ready.codeVerifier, ready.redirectUri);
  } catch (err) {
    console.error("Relay code exchange failed for", ready.providerId, err instanceof Error ? err.message : "");
    tokens = null;
  }
  const device = deviceTokens(tokens, "");
  if (!device) return { status: 400, body: { error: "invalid_grant", error_description: "Failed to exchange authorization code for tokens" } };
  return { status: 200, body: { status: "completed", ...device } };
}

export function prepareRelayRefresh(providerId: unknown, refreshToken: unknown): { ready: false; result: RelayHttpResult } | RelayRefreshReady {
  applyContentProviderSecrets();
  if (typeof providerId !== "string" || !isServerSecretProvider(providerId)) {
    return reject(400, "unsupported_provider", "This provider refreshes on the device");
  }
  if (typeof refreshToken !== "string" || refreshToken.length < 1 || refreshToken.length > 4096) {
    return reject(400, "invalid_request", "refreshToken is required");
  }
  if (!serverSecret(providerId)) return reject(500, "server_error", "Provider secret is not configured");
  return { ready: true, providerId, refreshToken };
}

export async function runRelayRefresh(ready: RelayRefreshReady): Promise<RelayHttpResult> {
  applyContentProviderSecrets();
  const config = getProviderConfig(ready.providerId) as ContentProviderConfig | null;
  if (!config?.oauthBase || !config.clientId) return { status: 500, body: { error: "server_error", error_description: "Provider is not available" } };
  const tokenHelper = new TokenHelper();
  let refreshed: Record<string, unknown> | null = null;
  try {
    refreshed = await tokenHelper.refreshToken(config, {
      access_token: "",
      refresh_token: ready.refreshToken,
      token_type: "Bearer",
      created_at: 0,
      expires_in: 0,
      scope: ""
    }) as Record<string, unknown> | null;
  } catch (err) {
    console.error("Relay token refresh failed for", ready.providerId, err instanceof Error ? err.message : "");
    refreshed = null;
  }
  const device = deviceTokens(refreshed, ready.refreshToken);
  if (!device) return { status: 400, body: { error: "invalid_grant", error_description: "Failed to refresh tokens" } };
  return { status: 200, body: device };
}

export function relayLookupBuckets(ip: string): { key: string; max: number }[] {
  if (LoginRateLimiter.isLoopback(ip)) return [];
  return [{ key: `relayxchg:ip|${(ip || "unknown").slice(0, 60)}`, max: 5000 }];
}

export function exchangeRateBuckets(ip: string, sessionCode: string, granting: boolean): { key: string; max: number }[] {
  const code = (sessionCode || "").slice(0, 16);
  const buckets = [{ key: `relayxchg:sess|${code}`, max: 240 }];
  if (granting) buckets.push({ key: `relayxchg:grant|${code}`, max: 8 });
  if (granting && !LoginRateLimiter.isLoopback(ip)) buckets.push({ key: `relayxchg:grantip|${(ip || "unknown").slice(0, 60)}`, max: 60 });
  return buckets;
}

export function refreshRateBuckets(ip: string, refreshToken: string): { key: string; max: number }[] {
  const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex").slice(0, 32);
  const buckets = [{ key: `relayrfsh:tok|${tokenHash}`, max: 30 }];
  if (!LoginRateLimiter.isLoopback(ip)) buckets.push({ key: `relayrfsh:ip|${(ip || "unknown").slice(0, 60)}`, max: 120 });
  return buckets;
}

type RelayBudgetRepo = { loginAttempt?: { loadCount: (key: string, windowSeconds: number) => Promise<number>; increment: (key: string, windowSeconds: number) => Promise<void> } };

export async function consumeRelayBudget(repos: RelayBudgetRepo, buckets: { key: string; max: number }[]): Promise<boolean> {
  if (!buckets.length) return true;
  try {
    const repo = repos?.loginAttempt;
    if (!repo) return true;
    for (const bucket of buckets) {
      if (await repo.loadCount(bucket.key, RELAY_WINDOW_SECONDS) >= bucket.max) return false;
    }
    for (const bucket of buckets) await repo.increment(bucket.key, RELAY_WINDOW_SECONDS);
    return true;
  } catch (err) {
    console.error("Provider relay throttle failed:", err instanceof Error ? err.message : err);
    return true;
  }
}
