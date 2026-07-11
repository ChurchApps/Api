import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { ContentProviderAuth } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { getProvider } from "@churchapps/content-providers";

@controller("/doing/contentProviderAuths")
export class ContentProviderAuthController extends DoingBaseController {
  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const idsString = typeof req.query.ids === "string" ? req.query.ids : req.query.ids ? String(req.query.ids) : "";
      if (!idsString) return this.json({ error: "Missing required parameter: ids" });
      const ids = idsString.split(",");
      return await this.repos.contentProviderAuth.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/ministry/:ministryId")
  public async getByMinistry(@requestParam("ministryId") ministryId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      return await this.repos.contentProviderAuth.loadByMinistry(au.churchId, ministryId);
    });
  }

  @httpGet("/ministry/:ministryId/:providerId")
  public async getByMinistryAndProvider(
    @requestParam("ministryId") ministryId: string,
    @requestParam("providerId") providerId: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      return await this.repos.contentProviderAuth.loadByMinistryAndProvider(au.churchId, ministryId, providerId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const data = await this.repos.contentProviderAuth.load(au.churchId, id);
      return this.repos.contentProviderAuth.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const data = await this.repos.contentProviderAuth.loadAll(au.churchId);
      return this.repos.contentProviderAuth.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, ContentProviderAuth[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const promises: Promise<ContentProviderAuth>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.contentProviderAuth.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.contentProviderAuth.convertAllToModel(au.churchId, result);
    });
  }

  // Runs the PKCE token exchange server-side: the client_secret lives here (setProviderSecret in ProviderProxyController)
  // and the token endpoint sends no CORS headers, so the browser can't do this itself.
  @httpPost("/exchange")
  public async exchange(req: express.Request<{}, {}, { ministryId: string; providerId: string; code: string; codeVerifier: string; redirectUri: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const { ministryId, providerId, code, codeVerifier, redirectUri } = req.body;
      if (!ministryId || !providerId || !code || !codeVerifier || !redirectUri) return this.json({ error: "Missing required parameters" }, 400);

      const provider = getProvider(providerId) as { exchangeCodeForTokens?: (code: string, codeVerifier: string, redirectUri: string) => Promise<any> } | null;
      if (!provider?.exchangeCodeForTokens) return this.json({ error: "Provider does not support code exchange" }, 400);

      const tokens = await provider.exchangeCodeForTokens(code, codeVerifier, redirectUri);
      if (!tokens?.access_token) return this.json({ error: "Failed to exchange code for tokens" }, 400);

      const record: ContentProviderAuth = {
        churchId: au.churchId,
        ministryId,
        providerId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || "",
        tokenType: tokens.token_type || "Bearer",
        expiresAt: new Date((tokens.created_at + tokens.expires_in) * 1000),
        scope: tokens.scope || ""
      };
      const saved = await this.repos.contentProviderAuth.save(record);
      return this.repos.contentProviderAuth.convertToModel(au.churchId, saved);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      await this.repos.contentProviderAuth.delete(au.churchId, id);
      return {};
    });
  }
}
