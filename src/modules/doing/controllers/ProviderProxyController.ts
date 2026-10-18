import { controller, httpPost } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { getProvider, ContentProviderAuthData } from "@churchapps/content-providers";
import { ProviderAuthHelper } from "../helpers/ProviderAuthHelper.js";

interface ProxyRequestBody {
  ministryId?: string;
  providerId: string;
  path: string;
  resolution?: number;
}

interface Provider {
  readonly requiresAuth: boolean | (() => boolean);
  readonly authTypes?: string[];
  browse(path?: string | null, auth?: ContentProviderAuthData | null): Promise<unknown[]>;
  getPresentations?(path: string, auth?: ContentProviderAuthData | null): Promise<{ allFiles?: unknown[] } | null>;
  getPlaylist?(path: string, auth?: ContentProviderAuthData | null, resolution?: number): Promise<unknown[] | null>;
  getInstructions?(path: string, auth?: ContentProviderAuthData | null): Promise<unknown | null>;
  getExpandedInstructions?(path: string, auth?: ContentProviderAuthData | null): Promise<unknown | null>;
}

function providerRequiresAuth(provider: Provider): boolean {
  return typeof provider.requiresAuth === "function" ? provider.requiresAuth() : provider.requiresAuth;
}

@controller("/doing/providerProxy")
export class ProviderProxyController extends DoingBaseController {

  private async getAuthForProvider(churchId: string, ministryId: string | undefined, providerId: string): Promise<ContentProviderAuthData | null> {
    return ProviderAuthHelper.getAuth(this.repos, churchId, ministryId, providerId);
  }

  private getProviderOrError(providerId: string): Provider {
    const provider = getProvider(providerId) as unknown as Provider | null;
    if (!provider) {
      const err: any = new Error(`Unknown provider: ${providerId}`);
      err.status = 400;
      throw err;
    }
    // LAN providers (FreeShow) are reached by the device on the church network, never from the cloud.
    if (provider.authTypes?.includes("network_discovery")) {
      const err: any = new Error(`Provider is only reachable on the local network: ${providerId}`);
      err.status = 400;
      throw err;
    }
    return provider;
  }

  // authz-exempt: self-service — read-only provider proxy, auth scoped by au.churchId (connecting providers gated by plans.edit in ContentProviderAuthController)
  @httpPost("/browse")
  public async browse(req: express.Request<{}, {}, ProxyRequestBody>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const { ministryId, providerId, path } = req.body;

      if (!providerId) {
        return this.json({ error: "Missing required parameters: providerId" }, 400);
      }

      const provider = this.getProviderOrError(providerId);
      const auth = providerRequiresAuth(provider)
        ? await this.getAuthForProvider(au.churchId, ministryId, providerId)
        : null;
      if (providerRequiresAuth(provider) && !auth) return this.json({ error: "Provider not connected" }, 400);

      return await provider.browse(path || null, auth);
    });
  }

  // authz-exempt: self-service — read-only provider proxy, auth scoped by au.churchId (connecting providers gated by plans.edit in ContentProviderAuthController)
  @httpPost("/getPresentations")
  public async getPresentations(req: express.Request<{}, {}, ProxyRequestBody>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const { ministryId, providerId, path } = req.body;

      if (!providerId || !path) {
        return this.json({ error: "Missing required parameters: providerId, path" }, 400);
      }

      const provider = this.getProviderOrError(providerId);
      if (typeof provider.getPresentations !== "function") return this.json({ error: "Provider does not support presentations" }, 400);
      const auth = providerRequiresAuth(provider)
        ? await this.getAuthForProvider(au.churchId, ministryId, providerId)
        : null;
      if (providerRequiresAuth(provider) && !auth) return this.json({ error: "Provider not connected" }, 400);

      return await provider.getPresentations(path, auth);
    });
  }

  // authz-exempt: self-service — read-only provider proxy, auth scoped by au.churchId (connecting providers gated by plans.edit in ContentProviderAuthController)
  @httpPost("/getPlaylist")
  public async getPlaylist(req: express.Request<{}, {}, ProxyRequestBody>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const { ministryId, providerId, path, resolution } = req.body;

      if (!providerId || !path) {
        return this.json({ error: "Missing required parameters: providerId, path" }, 400);
      }

      const provider = this.getProviderOrError(providerId);
      const auth = providerRequiresAuth(provider)
        ? await this.getAuthForProvider(au.churchId, ministryId, providerId)
        : null;
      if (providerRequiresAuth(provider) && !auth) return this.json({ error: "Provider not connected" }, 400);

      if (provider.getPlaylist) {
        return await provider.getPlaylist(path, auth, resolution);
      }

      if (typeof provider.getPresentations !== "function") return this.json({ error: "Provider does not support presentations" }, 400);
      const presentations = await provider.getPresentations(path, auth);
      return presentations?.allFiles || [];
    });
  }

  // authz-exempt: self-service — read-only provider proxy, auth scoped by au.churchId (connecting providers gated by plans.edit in ContentProviderAuthController)
  @httpPost("/getInstructions")
  public async getInstructions(req: express.Request<{}, {}, ProxyRequestBody>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const { ministryId, providerId, path } = req.body;

      if (!providerId || !path) {
        return this.json({ error: "Missing required parameters: providerId, path" }, 400);
      }

      const provider = this.getProviderOrError(providerId);
      const auth = providerRequiresAuth(provider)
        ? await this.getAuthForProvider(au.churchId, ministryId, providerId)
        : null;
      if (providerRequiresAuth(provider) && !auth) return this.json({ error: "Provider not connected" }, 400);

      if (provider.getInstructions) {
        return await provider.getInstructions(path, auth);
      }

      return null;
    });
  }

  // authz-exempt: self-service — read-only provider proxy, auth scoped by au.churchId (connecting providers gated by plans.edit in ContentProviderAuthController)
  @httpPost("/getExpandedInstructions")
  public async getExpandedInstructions(req: express.Request<{}, {}, ProxyRequestBody>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const { ministryId, providerId, path } = req.body;

      if (!providerId || !path) {
        return this.json({ error: "Missing required parameters: providerId, path" }, 400);
      }

      const provider = this.getProviderOrError(providerId);
      const auth = providerRequiresAuth(provider)
        ? await this.getAuthForProvider(au.churchId, ministryId, providerId)
        : null;
      if (providerRequiresAuth(provider) && !auth) return this.json({ error: "Provider not connected" }, 400);

      if (provider.getExpandedInstructions) {
        return await provider.getExpandedInstructions(path, auth);
      }

      return null;
    });
  }
}
