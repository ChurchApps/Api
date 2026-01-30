import { controller, httpPost } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { getProvider, ContentProviderAuthData } from "@churchapps/content-provider-helper";
import { ContentProviderAuth } from "../models/index.js";

interface ProxyRequestBody {
  ministryId: string;
  providerId: string;
  path: string;
  resolution?: number;
}

// Provider interface for type safety (matches IProvider from content-provider-helper)
interface Provider {
  readonly requiresAuth: boolean | (() => boolean);
  browse(path?: string | null, auth?: ContentProviderAuthData | null): Promise<unknown[]>;
  getPresentations(path: string, auth?: ContentProviderAuthData | null): Promise<{ allFiles?: unknown[] } | null>;
  getPlaylist?(path: string, auth?: ContentProviderAuthData | null, resolution?: number): Promise<unknown[] | null>;
  getInstructions?(path: string, auth?: ContentProviderAuthData | null): Promise<unknown | null>;
  getExpandedInstructions?(path: string, auth?: ContentProviderAuthData | null): Promise<unknown | null>;
}

function providerRequiresAuth(provider: Provider): boolean {
  return typeof provider.requiresAuth === "function" ? provider.requiresAuth() : provider.requiresAuth;
}

@controller("/doing/providerProxy")
export class ProviderProxyController extends DoingBaseController {

  private convertAuthToProviderFormat(authRecord: ContentProviderAuth): ContentProviderAuthData | null {
    if (!authRecord.accessToken) return null;

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = authRecord.expiresAt ? Math.floor(authRecord.expiresAt.getTime() / 1000) : now + 3600;
    const createdAt = expiresAt - 3600; // Assume 1 hour tokens

    return {
      access_token: authRecord.accessToken,
      refresh_token: authRecord.refreshToken || "",
      token_type: authRecord.tokenType || "Bearer",
      created_at: createdAt,
      expires_in: Math.max(0, expiresAt - now),
      scope: authRecord.scope || ""
    };
  }

  private async getAuthForProvider(churchId: string, ministryId: string, providerId: string): Promise<ContentProviderAuthData | null> {
    const authRecord = await this.repos.contentProviderAuth.loadByMinistryAndProvider(churchId, ministryId, providerId);
    if (!authRecord) return null;
    return this.convertAuthToProviderFormat(authRecord);
  }

  private getProviderOrError(providerId: string): Provider {
    const provider = getProvider(providerId) as unknown as Provider | null;
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    return provider;
  }

  @httpPost("/browse")
  public async browse(req: express.Request<{}, {}, ProxyRequestBody>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { ministryId, providerId, path } = req.body;

      if (!ministryId || !providerId) {
        return this.json({ error: "Missing required parameters: ministryId, providerId" }, 400);
      }

      const provider = this.getProviderOrError(providerId);
      const auth = providerRequiresAuth(provider)
        ? await this.getAuthForProvider(au.churchId, ministryId, providerId)
        : null;

      return await provider.browse(path || null, auth);
    });
  }

  @httpPost("/getPresentations")
  public async getPresentations(req: express.Request<{}, {}, ProxyRequestBody>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { ministryId, providerId, path } = req.body;

      if (!ministryId || !providerId || !path) {
        return this.json({ error: "Missing required parameters: ministryId, providerId, path" }, 400);
      }

      const provider = this.getProviderOrError(providerId);
      const auth = providerRequiresAuth(provider)
        ? await this.getAuthForProvider(au.churchId, ministryId, providerId)
        : null;

      return await provider.getPresentations(path, auth);
    });
  }

  @httpPost("/getPlaylist")
  public async getPlaylist(req: express.Request<{}, {}, ProxyRequestBody>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { ministryId, providerId, path, resolution } = req.body;

      if (!ministryId || !providerId || !path) {
        return this.json({ error: "Missing required parameters: ministryId, providerId, path" }, 400);
      }

      const provider = this.getProviderOrError(providerId);
      const auth = providerRequiresAuth(provider)
        ? await this.getAuthForProvider(au.churchId, ministryId, providerId)
        : null;

      if (provider.getPlaylist) {
        return await provider.getPlaylist(path, auth, resolution);
      }

      // Fallback: get presentations and extract files
      const presentations = await provider.getPresentations(path, auth);
      return presentations?.allFiles || [];
    });
  }

  @httpPost("/getInstructions")
  public async getInstructions(req: express.Request<{}, {}, ProxyRequestBody>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { ministryId, providerId, path } = req.body;

      if (!ministryId || !providerId || !path) {
        return this.json({ error: "Missing required parameters: ministryId, providerId, path" }, 400);
      }

      const provider = this.getProviderOrError(providerId);
      const auth = providerRequiresAuth(provider)
        ? await this.getAuthForProvider(au.churchId, ministryId, providerId)
        : null;

      if (provider.getInstructions) {
        return await provider.getInstructions(path, auth);
      }

      return null;
    });
  }

  @httpPost("/getExpandedInstructions")
  public async getExpandedInstructions(req: express.Request<{}, {}, ProxyRequestBody>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { ministryId, providerId, path } = req.body;

      if (!ministryId || !providerId || !path) {
        return this.json({ error: "Missing required parameters: ministryId, providerId, path" }, 400);
      }

      const provider = this.getProviderOrError(providerId);
      const auth = providerRequiresAuth(provider)
        ? await this.getAuthForProvider(au.churchId, ministryId, providerId)
        : null;

      if (provider.getExpandedInstructions) {
        return await provider.getExpandedInstructions(path, auth);
      }

      return null;
    });
  }
}
