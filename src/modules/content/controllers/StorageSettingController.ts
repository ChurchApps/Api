import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { StorageProvider } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { StorageResolver } from "../helpers/StorageResolver.js";

@controller("/content/storage")
export class StorageSettingController extends ContentBaseController {

  @httpGet("/providers")
  public async getProviders(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const rows = await this.repos.storageProvider.loadByChurchId(au.churchId);
      const result = this.repos.storageProvider.convertAllToModel(rows as any[]);
      return result.map((p: StorageProvider) => ({ ...p, apiKey: p.apiKey ? "********" : "", apiSecret: p.apiSecret ? "********" : "" }));
    });
  }

  @httpPost("/providers")
  public async saveProvider(req: express.Request<{}, {}, StorageProvider[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const saved = await Promise.all(
        req.body.map(async (provider) => {
          provider.churchId = au.churchId;
          return this.repos.storageProvider.save(provider);
        })
      );
      return this.repos.storageProvider.convertAllToModel(saved as any[]);
    });
  }

  @httpDelete("/providers/:id")
  public async deleteProvider(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
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
}
