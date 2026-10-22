import crypto from "crypto";
import express from "express";

// PKCE (RFC 7636) and self-registration (RFC 7591) rules for public clients such as MCP connectors.

const S256_CHALLENGE = /^[A-Za-z0-9\-_]{43,128}$/;
const CODE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

export function isS256Challenge(challenge: unknown): boolean {
  return typeof challenge === "string" && S256_CHALLENGE.test(challenge);
}

export function verifyS256(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !CODE_VERIFIER.test(verifier) || !challenge) return false;
  const computed = Buffer.from(crypto.createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
}

/** Registered redirect URIs are stored as one string, separated by `|`, `,` or whitespace (or a JSON array). */
export function parseRedirectUris(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((u) => typeof u === "string");
    } catch { /* fall through to the delimited form */ }
  }
  return trimmed.split(/[|,\s]+/).filter((u) => u.length > 0);
}

/** Exact match only: a prefix or substring of a registered URI is not a registered URI. */
export function isRegisteredRedirectUri(raw: string | string[] | null | undefined, redirectUri: string): boolean {
  return !!redirectUri && parseRedirectUris(raw).includes(redirectUri);
}

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Self-registered clients may only send users back to https, or to a loopback address on the user's own machine. */
export function isAllowedSelfRegisteredRedirect(uri: unknown): boolean {
  if (typeof uri !== "string" || uri.length > 500 || /[\s|,]/.test(uri)) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname);
}

/** OAuth clients post form-encoded bodies; on Lambda those arrive as a raw string. */
export function oauthBody<T = any>(req: express.Request): T {
  const body: any = req.body;
  if (typeof body === "string") return Object.fromEntries(new URLSearchParams(body)) as T;
  return (body || {}) as T;
}
