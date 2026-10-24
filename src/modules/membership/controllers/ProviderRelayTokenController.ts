import crypto from "crypto";
import { controller, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { getProvider, getProviderConfig, setProviderSecret, TokenHelper, ContentProviderConfig, GoCurriculumProvider } from "@churchapps/content-providers";
import { MembershipBaseController } from "./MembershipBaseController.js";

const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9\-_]{43,128}$/;
const SECRET_ENV: Record<string, string> = { onedrive: "ONEDRIVE_CLIENT_SECRET", googledrive: "GOOGLE_DRIVE_CLIENT_SECRET" };

function applySecrets() {
  setProviderSecret("googledrive", process.env.GOOGLE_DRIVE_CLIENT_SECRET || "");
  setProviderSecret("onedrive", process.env.ONEDRIVE_CLIENT_SECRET || "");
  setProviderSecret("gocurriculumFeeds", process.env.GOCURRICULUM_FEEDS || "");
}

function splitRedirect(stored: string): { redirectUri: string; codeChallenge: string } {
  const idx = stored.indexOf("\n");
  if (idx < 0) return { redirectUri: stored, codeChallenge: "" };
  return { redirectUri: stored.slice(0, idx), codeChallenge: stored.slice(idx + 1) };
}

function deviceTokens(tokens: any, fallbackRefresh = "") {
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || fallbackRefresh,
    token_type: tokens.token_type || "Bearer",
    expires_in: typeof tokens.expires_in === "number" ? tokens.expires_in : 3600,
    scope: tokens.scope || "",
    created_at: typeof tokens.created_at === "number" ? tokens.created_at : Math.floor(Date.now() / 1000)
  };
}

@controller("/membership/oauth/relay")
export class ProviderRelayTokenController extends MembershipBaseController {

  // Anonymous: FreePlay has no B1 user. Only the auth code captured on this relay session is exchanged, and only if the verifier matches the challenge stored at create.
  @httpPost("/sessions/:sessionCode/exchange")
  public async exchange(@requestParam("sessionCode") sessionCode: string, req: express.Request<{}, {}, { codeVerifier?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      applySecrets();
      const session = await this.repos.oAuthRelaySession.loadBySessionCode(sessionCode);
      if (!session) return this.json({ error: "not_found" }, 404);
      const providerId = session.provider || "";
      if (!SECRET_ENV[providerId]) return this.json({ error: "unsupported_provider", error_description: "This provider exchanges on the device" }, 400);
      if (!process.env[SECRET_ENV[providerId]]) return this.json({ error: "server_error", error_description: "Provider secret is not configured" }, 500);
      const verifier = req.body?.codeVerifier;
      if (typeof verifier !== "string" || !VERIFIER.test(verifier)) return this.json({ error: "invalid_request", error_description: "codeVerifier must be a PKCE verifier" }, 400);
      const { redirectUri, codeChallenge } = splitRedirect(session.redirectUri || "");
      if (!CHALLENGE.test(codeChallenge)) return this.json({ error: "invalid_request", error_description: "Relay session has no PKCE code challenge. Create the session with codeChallenge." }, 400);
      const actual = Buffer.from(crypto.createHash("sha256").update(verifier).digest("base64url"));
      const expected = Buffer.from(codeChallenge);
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return this.json({ error: "invalid_grant", error_description: "codeVerifier does not match this relay session" }, 400);
      if (session.status !== "completed") {
        const expiresMs = session.expiresAt ? new Date(session.expiresAt).getTime() : Date.now();
        return this.json({ status: session.status || "pending", expiresIn: Math.max(0, Math.floor((expiresMs - Date.now()) / 1000)) });
      }
      if (!session.authCode) return this.json({ error: "invalid_grant", error_description: "Relay session has no authorization code" }, 400);
      const authCode = session.authCode;
      await this.repos.oAuthRelaySession.delete(session.id);
      const provider = getProvider(providerId) as { exchangeCodeForTokens?: (code: string, codeVerifier: string, redirectUri: string) => Promise<any> } | null;
      let tokens: any = null;
      try { tokens = await provider?.exchangeCodeForTokens?.(authCode, verifier, redirectUri); } catch { tokens = null; }
      if (!tokens?.access_token) return this.json({ error: "invalid_grant", error_description: "Failed to exchange authorization code for tokens" }, 400);
      return this.json({ status: "completed", ...deviceTokens(tokens) });
    });
  }

  // Anonymous: refresh token is the device credential. Provider is limited to onedrive and googledrive. Does not accept an auth code.
  @httpPost("/refresh")
  public async refresh(req: express.Request<{}, {}, { provider?: string; refreshToken?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      applySecrets();
      const providerId = req.body?.provider || "";
      const refreshToken = req.body?.refreshToken;
      if (!SECRET_ENV[providerId]) return this.json({ error: "unsupported_provider", error_description: "This provider refreshes on the device" }, 400);
      if (typeof refreshToken !== "string" || refreshToken.length < 1 || refreshToken.length > 4096) return this.json({ error: "invalid_request", error_description: "refreshToken is required" }, 400);
      if (!process.env[SECRET_ENV[providerId]]) return this.json({ error: "server_error", error_description: "Provider secret is not configured" }, 500);
      const config = getProviderConfig(providerId) as ContentProviderConfig | null;
      if (!config) return this.json({ error: "server_error", error_description: "Provider is not available" }, 500);
      let refreshed: any = null;
      try {
        refreshed = await new TokenHelper().refreshToken(config, { access_token: "", refresh_token: refreshToken, token_type: "Bearer", created_at: 0, expires_in: 0, scope: "" });
      } catch { refreshed = null; }
      if (!refreshed?.access_token) return this.json({ error: "invalid_grant", error_description: "Failed to refresh tokens" }, 400);
      return this.json(deviceTokens(refreshed, refreshToken));
    });
  }

  // Anonymous: the Go access token is the device credential. getCatalog verifies it with Go before returning the private catalog.
  @httpPost("/gocurriculum/catalog")
  public async goCurriculumCatalog(req: express.Request<{}, {}, { groupId?: string; accessToken?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      applySecrets();
      const groupId = req.body?.groupId;
      const accessToken = req.body?.accessToken;
      if (typeof groupId !== "string" || typeof accessToken !== "string" || accessToken.length < 1 || accessToken.length > 4096) return this.json({ error: "invalid_request", error_description: "groupId and accessToken are required" }, 400);
      const provider = getProvider("gocurriculum") as GoCurriculumProvider | null;
      const catalog = await provider?.getCatalog(groupId, { access_token: accessToken, refresh_token: "", token_type: "Bearer", created_at: 0, expires_in: 0, scope: "" });
      if (!catalog) return this.json({ error: "not_found", error_description: "Invalid Go login or unknown group" }, 404);
      return this.json(catalog);
    });
  }
}
