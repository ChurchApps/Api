import { getProviderConfig, TokenHelper, ContentProviderAuthData, ContentProviderConfig, setProviderSecret } from "@churchapps/content-providers";
import { ContentProviderAuth } from "../models/index.js";
import { Repos } from "../repositories/index.js";

setProviderSecret("gocurriculum", process.env.GOCURRICULUM_CLIENT_SECRET || "");
setProviderSecret("googledrive", process.env.GOOGLE_DRIVE_CLIENT_SECRET || "");

export class ProviderAuthHelper {
  // Single-flight de-dup for token refreshes. If two requests race past the expiry check,
  // the second one piggy-backs on the first's refresh promise instead of consuming the same
  // refresh_token a second time (which would invalidate it on rotating-token providers).
  // Static so it spans request-scoped controller instances within the same Lambda warm pool.
  private static refreshInflight = new Map<string, Promise<ContentProviderAuthData | null>>();

  static convertAuthToProviderFormat(authRecord: ContentProviderAuth): ContentProviderAuthData | null {
    if (!authRecord.accessToken) return null;

    // TokenHelper.isTokenExpired uses (created_at + expires_in) as the absolute expiry.
    // Anchor created_at to now so the sum matches the stored expiresAt — otherwise tokens
    // with under ~1h remaining are treated as expired and refreshed every request, which
    // breaks rotating-refresh-token providers (Dropbox, Planning Center).
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = authRecord.expiresAt ? Math.floor(new Date(authRecord.expiresAt).getTime() / 1000) : now + 3600;

    return {
      access_token: authRecord.accessToken,
      refresh_token: authRecord.refreshToken || "",
      token_type: authRecord.tokenType || "Bearer",
      created_at: now,
      expires_in: Math.max(0, expiresAt - now),
      scope: authRecord.scope || ""
    };
  }

  // No ministryId, or no row for that ministry, falls back to the church-level connection (ministryId NULL).
  static async loadRecord(repos: Repos, churchId: string, ministryId: string | null | undefined, providerId: string): Promise<ContentProviderAuth | null> {
    const ministryRecord = ministryId ? await repos.contentProviderAuth.loadByMinistryAndProvider(churchId, ministryId, providerId) : null;
    return ministryRecord || await repos.contentProviderAuth.loadChurchLevelByProvider(churchId, providerId);
  }

  static async getAuth(repos: Repos, churchId: string, ministryId: string | null | undefined, providerId: string): Promise<ContentProviderAuthData | null> {
    const authRecord = await this.loadRecord(repos, churchId, ministryId, providerId);
    if (!authRecord) return null;

    let auth = this.convertAuthToProviderFormat(authRecord);
    if (!auth) return null;

    const tokenHelper = new TokenHelper();
    if (tokenHelper.isTokenExpired(auth) && auth.refresh_token) {
      const key = `${churchId}:${authRecord.id}`;
      let inflight = this.refreshInflight.get(key);
      if (!inflight) {
        const expiredAuth = auth;
        inflight = (async (): Promise<ContentProviderAuthData | null> => {
          // Re-read inside the critical section: another Lambda invocation in the same warm
          // pool may have already refreshed, in which case we can skip the network call.
          const fresh = await repos.contentProviderAuth.load(churchId, authRecord.id);
          if (fresh) {
            const freshAuth = this.convertAuthToProviderFormat(fresh);
            if (freshAuth && !tokenHelper.isTokenExpired(freshAuth)) return freshAuth;
          }

          const config = getProviderConfig(providerId) as ContentProviderConfig | null;
          if (!config) return null;
          const refreshedAuth = await tokenHelper.refreshToken(config, expiredAuth);
          if (!refreshedAuth) return null;

          authRecord.accessToken = refreshedAuth.access_token;
          authRecord.refreshToken = refreshedAuth.refresh_token;
          authRecord.expiresAt = new Date((refreshedAuth.created_at + refreshedAuth.expires_in) * 1000);
          await repos.contentProviderAuth.save(authRecord);
          return refreshedAuth;
        })().finally(() => {
          this.refreshInflight.delete(key);
        });
        this.refreshInflight.set(key, inflight);
      }
      const refreshed = await inflight;
      if (refreshed) auth = refreshed;
    }

    return auth;
  }
}
