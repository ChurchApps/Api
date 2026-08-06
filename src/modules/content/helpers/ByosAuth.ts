import axios from "axios";
import { EncryptionHelper } from "@churchapps/apihelper";
import { StorageProvider } from "../models/index.js";
import type { StorageProviderRepo } from "../repositories/StorageProviderRepo.js";

export const BYOS_PROVIDERS = ["googledrive", "dropbox", "onedrive", "s3"];

interface ByosOAuthConfig {
  tokenUrl: string;
  clientId: string;
  getClientSecret?: () => string;
}

// Client ids are public identifiers; keep in sync with B1Admin's byosProviders.ts.
// TODO owner action: fill googledrive (rides on the pending #944 Google Cloud client), onedrive (new Azure AD
// confidential app), and dropbox (new "app folder" access-type app — not the read-scoped content-providers app).
const OAUTH_CONFIGS: Record<string, ByosOAuthConfig> = {
  googledrive: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: "214868247432-hao323qmsfu96h345udaifs8f1nc7i71.apps.googleusercontent.com",
    getClientSecret: () => process.env.GOOGLE_DRIVE_CLIENT_SECRET || ""
  },
  dropbox: {
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    clientId: "6whskt40gy3ekjo"
  },
  onedrive: {
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientId: "",
    getClientSecret: () => process.env.ONEDRIVE_CLIENT_SECRET || ""
  }
};

export class ByosAuth {
  // Single-flight refresh de-dup, same rationale as ProviderProxyController.refreshInflight:
  // Dropbox rotates refresh tokens, so a double-consume invalidates the stored one.
  private static refreshInflight = new Map<string, Promise<string | null>>();

  static isOAuthProvider(provider: string) {
    return !!OAUTH_CONFIGS[provider];
  }

  static async exchangeCode(provider: string, code: string, codeVerifier: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
    const config = OAUTH_CONFIGS[provider];
    if (!config) return null;
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: config.clientId
    });
    const secret = config.getClientSecret?.();
    if (secret) params.set("client_secret", secret);
    const resp = await axios.post(config.tokenUrl, params.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    const data = resp.data;
    if (!data?.access_token) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || "",
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000)
    };
  }

  // Returns a decrypted, non-expired access token for the row, refreshing (and persisting) if needed.
  static async getAccessToken(repo: StorageProviderRepo, row: StorageProvider): Promise<string | null> {
    if (!row.accessToken) return null;
    const bufferMs = 5 * 60 * 1000;
    const expiresAt = row.tokenExpiresAt ? new Date(row.tokenExpiresAt).getTime() : 0;
    if (expiresAt - bufferMs > Date.now()) return EncryptionHelper.decrypt(row.accessToken);
    if (!row.refreshToken) return EncryptionHelper.decrypt(row.accessToken);

    const key = row.id;
    let inflight = ByosAuth.refreshInflight.get(key);
    if (!inflight) {
      inflight = (async (): Promise<string | null> => {
        // Re-read inside the critical section: another warm invocation may have already refreshed.
        const rows = await repo.loadByChurchId(row.churchId);
        const fresh = repo.convertAllToModel(rows as any[]).find((r: StorageProvider) => r.id === row.id) || row;
        const freshExpires = fresh.tokenExpiresAt ? new Date(fresh.tokenExpiresAt).getTime() : 0;
        if (fresh.accessToken && freshExpires - bufferMs > Date.now()) return EncryptionHelper.decrypt(fresh.accessToken);

        const config = OAUTH_CONFIGS[fresh.provider];
        if (!config || !fresh.refreshToken) return fresh.accessToken ? EncryptionHelper.decrypt(fresh.accessToken) : null;
        const params = new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: EncryptionHelper.decrypt(fresh.refreshToken),
          client_id: config.clientId
        });
        const secret = config.getClientSecret?.();
        if (secret) params.set("client_secret", secret);
        const resp = await axios.post(config.tokenUrl, params.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        const data = resp.data;
        if (!data?.access_token) return null;

        fresh.accessToken = EncryptionHelper.encrypt(data.access_token);
        if (data.refresh_token) fresh.refreshToken = EncryptionHelper.encrypt(data.refresh_token);
        fresh.tokenExpiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
        await repo.save(fresh);
        row.accessToken = fresh.accessToken;
        row.refreshToken = fresh.refreshToken;
        row.tokenExpiresAt = fresh.tokenExpiresAt;
        return data.access_token;
      })().finally(() => {
        ByosAuth.refreshInflight.delete(key);
      });
      ByosAuth.refreshInflight.set(key, inflight);
    }
    return inflight;
  }
}
