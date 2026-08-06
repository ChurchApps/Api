import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { EncryptionHelper } from "@churchapps/apihelper";
import { ContentBaseController } from "./ContentBaseController.js";
import { StorageProvider } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { StorageResolver } from "../helpers/StorageResolver.js";
import { ByosAuth } from "../helpers/ByosAuth.js";

@controller("/content/storage")
export class StorageSettingController extends ContentBaseController {

  @httpGet("/providers")
  public async getProviders(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const rows = await this.repos.storageProvider.loadByChurchId(au.churchId);
      const result = this.repos.storageProvider.convertAllToModel(rows as any[]);
      return result.map((p: StorageProvider) => this.mask(p));
    });
  }

  @httpPost("/providers")
  public async saveProvider(req: express.Request<{}, {}, StorageProvider[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const existingRows = this.repos.storageProvider.convertAllToModel(await this.repos.storageProvider.loadByChurchId(au.churchId) as any[]);
      const saved = await Promise.all(
        req.body.map(async (provider) => {
          provider.churchId = au.churchId;
          const existing = existingRows.find((r: StorageProvider) => (provider.id && r.id === provider.id) || (!provider.id && r.provider === provider.provider));
          if (existing) provider.id = existing.id;
          // masked values round-trip: keep stored ciphertext, encrypt fresh secrets
          if (provider.apiSecret && provider.apiSecret !== "********") provider.apiSecret = EncryptionHelper.encrypt(provider.apiSecret);
          else if (provider.apiSecret === "********" && existing) provider.apiSecret = existing.apiSecret;
          if (provider.apiKey === "********" && existing) provider.apiKey = existing.apiKey;
          delete provider.accessToken;
          delete provider.refreshToken;
          delete provider.tokenExpiresAt;
          const result = await this.repos.storageProvider.save(provider);
          if (provider.enabled) await this.disableOthers(au.churchId, result.id);
          return result;
        })
      );
      return saved.map((p: StorageProvider) => this.mask(p));
    });
  }

  @httpPost("/exchange")
  public async exchange(req: express.Request<{}, {}, { provider: string; code: string; codeVerifier: string; redirectUri: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const { provider, code, codeVerifier, redirectUri } = req.body;
      if (!ByosAuth.isOAuthProvider(provider)) return this.json({ error: "Unknown provider" }, 400);
      const tokens = await ByosAuth.exchangeCode(provider, code, codeVerifier, redirectUri);
      if (!tokens) return this.json({ error: "Token exchange failed" }, 400);
      const existingRows = this.repos.storageProvider.convertAllToModel(await this.repos.storageProvider.loadByChurchId(au.churchId) as any[]);
      const row: StorageProvider = existingRows.find((r: StorageProvider) => r.provider === provider) || { churchId: au.churchId, provider };
      row.accessToken = EncryptionHelper.encrypt(tokens.accessToken);
      if (tokens.refreshToken) row.refreshToken = EncryptionHelper.encrypt(tokens.refreshToken);
      row.tokenExpiresAt = tokens.expiresAt;
      row.enabled = true;
      const result = await this.repos.storageProvider.save(row);
      await this.disableOthers(au.churchId, result.id);
      return this.mask(result);
    });
  }

  @httpDelete("/providers/:id")
  public async deleteProvider(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const rows = this.repos.storageProvider.convertAllToModel(await this.repos.storageProvider.loadByChurchId(au.churchId) as any[]);
      const row = rows.find((r: StorageProvider) => r.id === id);
      if (!row) return this.json({});
      // files still point at this provider: keep the credentials so downloads/deletes work, just stop new uploads
      const inUse = await this.repos.file.countByProvider(au.churchId, row.provider);
      if (inUse > 0) {
        row.enabled = false;
        await this.repos.storageProvider.save(row);
        return this.json({ disabled: true, fileCount: inUse });
      }
      await this.repos.storageProvider.delete(au.churchId, id);
      return this.json({});
    });
  }

  @httpGet("/status")
  public async getStatus(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const storage = await StorageResolver.forChurch(this.repos.storageProvider, au.churchId);
      if (!storage.provider.getQuota) return { provider: storage.name };
      try {
        const quota = await storage.provider.getQuota(au.churchId);
        return { provider: storage.name, ...(quota || {}) };
      } catch {
        return { provider: storage.name, error: "unavailable" };
      }
    });
  }

  private async disableOthers(churchId: string, keepId: string) {
    const rows = this.repos.storageProvider.convertAllToModel(await this.repos.storageProvider.loadByChurchId(churchId) as any[]);
    for (const r of rows) {
      if (r.id !== keepId && r.enabled) {
        r.enabled = false;
        await this.repos.storageProvider.save(r);
      }
    }
  }

  private mask(p: StorageProvider) {
    return {
      id: p.id,
      churchId: p.churchId,
      provider: p.provider,
      enabled: p.enabled,
      settings: p.settings,
      apiKey: p.apiKey ? "********" : "",
      apiSecret: p.apiSecret ? "********" : "",
      connected: !!p.accessToken
    };
  }
}
