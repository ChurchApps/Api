import { controller, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { LoginRateLimiter } from "../helpers/LoginRateLimiter.js";
import { OAuthRelaySessionRepo } from "../repositories/OAuthRelaySessionRepo.js";
import { consumeRelayBudget, exchangeRateBuckets, prepareRelayExchange, prepareRelayRefresh, refreshRateBuckets, relayLookupBuckets, runRelayExchange, runRelayRefresh } from "../helpers/ProviderRelayTokenHelper.js";

@controller("/membership/oauth/relay")
export class ProviderRelayTokenController extends MembershipBaseController {

  // Anonymous: FreePlay TVs have no B1 user. Exchange is bound to one relay session's captured
  // auth code, and the PKCE verifier has to match the challenge stored when that session was created.
  @httpPost("/sessions/:sessionCode/exchange")
  public async exchange(@requestParam("sessionCode") sessionCode: string, req: express.Request<{}, {}, { codeVerifier?: string; code?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const ip = LoginRateLimiter.getClientIp(req);
      if (!(await consumeRelayBudget(this.repos, relayLookupBuckets(ip)))) return this.json({ error: "slow_down", error_description: "Too many requests" }, 429);
      if (!OAuthRelaySessionRepo.isSessionCode(sessionCode)) return this.json({ error: "not_found" }, 404);
      const session = await this.repos.oAuthRelaySession.loadBySessionCode(sessionCode);
      if (!session) return this.json({ error: "not_found" }, 404);

      const prepared = prepareRelayExchange(session, req.body?.codeVerifier, req.body?.code);
      if (!(await consumeRelayBudget(this.repos, exchangeRateBuckets(ip, sessionCode, prepared.ready)))) {
        return this.json({ error: "slow_down", error_description: "Too many requests" }, 429);
      }
      if (!prepared.ready) {
        if (prepared.result.consume && session.id) await this.repos.oAuthRelaySession.delete(session.id);
        return this.json(prepared.result.body, prepared.result.status);
      }
      if (!session.id) return this.json({ error: "server_error", error_description: "Relay session is missing an id" }, 500);

      const claimed = await this.repos.oAuthRelaySession.claimCompleted(session.id);
      if (!claimed) return this.json({ error: "invalid_grant", error_description: "Authorization code already used" }, 400);
      try {
        const result = await runRelayExchange(prepared);
        return this.json(result.body, result.status);
      } finally {
        try { await this.repos.oAuthRelaySession.delete(session.id); } catch (err) { console.error("Relay session cleanup failed:", err instanceof Error ? err.message : err); }
      }
    });
  }

  // Anonymous: the refresh token is the device credential. Only confidential providers are accepted,
  // and the client cannot supply a token URL, client id, or secret. This endpoint does not accept an auth code.
  @httpPost("/refresh")
  public async refresh(req: express.Request<{}, {}, { provider?: string; refreshToken?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
      const ip = LoginRateLimiter.getClientIp(req);
      if (!(await consumeRelayBudget(this.repos, refreshRateBuckets(ip, refreshToken)))) {
        return this.json({ error: "slow_down", error_description: "Too many requests" }, 429);
      }
      const prepared = prepareRelayRefresh(req.body?.provider, req.body?.refreshToken);
      if (!prepared.ready) return this.json(prepared.result.body, prepared.result.status);
      const result = await runRelayRefresh(prepared);
      return this.json(result.body, result.status);
    });
  }
}
