import { controller, httpPost, httpGet, requestParam, httpDelete, httpPatch } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController";
import { Gateway } from "../models";
import { GatewayService } from "../../../shared/helpers/GatewayService";
import { EncryptionHelper } from "@churchapps/apihelper";
import { Permissions } from "../../../shared/helpers/Permissions";

@controller("/giving/gateways")
export class GatewayController extends GivingCrudController {
  protected crudSettings = {
    repoKey: "gateway",
    permissions: { view: Permissions.settings.edit, edit: Permissions.settings.edit },
    routes: [] as const
  };
  @httpGet("/churchId/:churchId")
  public async getForChurch(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return this.repos.gateway.convertAllToModel(churchId, (await this.repos.gateway.loadAll(churchId)) as any[]);
    });
  }

  @httpGet("/configured/:churchId")
  public async isConfigured(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];
      const hasConfiguredGateway = gateways.length > 0 && gateways.some((g: any) => g.privateKey && g.privateKey.trim() !== "");
      return { configured: hasConfiguredGateway };
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json(null, 401);
      else {
        return this.repos.gateway.convertToModel(au.churchId, await this.repos.gateway.load(au.churchId, id));
      }
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return this.repos.gateway.convertAllToModel(au.churchId, (await this.repos.gateway.loadAll(au.churchId)) as any[]);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Gateway[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json(null, 401);
      else {
        try {
          const savedGateways = await Promise.all(
            req.body.map(async (gateway) => {
              const validatedSettings = this.validateProviderSettings(gateway.provider, gateway.settings);
              const environment = this.normalizeEnvironment(gateway.environment);
              const privateKey = typeof gateway.privateKey === "string" ? gateway.privateKey : "";
              const webhookKey = typeof gateway.webhookKey === "string" ? gateway.webhookKey : "";

              // Encrypt secrets immediately so downstream helpers receive encrypted values
              const encryptedGateway: Gateway = {
                ...gateway,
                privateKey: privateKey ? EncryptionHelper.encrypt(privateKey) : "",
                webhookKey: webhookKey ? EncryptionHelper.encrypt(webhookKey) : "",
                settings: validatedSettings,
                environment,
                churchId: au.churchId,
                payFees: gateway.payFees ?? false
              };

              if (req.hostname !== "localhost") {
                // Delete existing webhooks before provisioning a new one
                await GatewayService.deleteWebhooks(encryptedGateway, au.churchId);

                // Create new webhook based on provider capabilities
                const providerName = encryptedGateway.provider?.toLowerCase();
                const webHookUrl =
                  req.get("x-forwarded-proto") +
                  "://" +
                  req.hostname +
                  `/giving/donate/webhook/${providerName}?churchId=` +
                  au.churchId;
                const webhook = await GatewayService.createWebhook(encryptedGateway, webHookUrl);

                const resolvedWebhookSecret = webhook.secret || webhook.id;
                encryptedGateway.webhookKey = resolvedWebhookSecret ? EncryptionHelper.encrypt(resolvedWebhookSecret) : "";
              }

              // Create provider product if supported
              const productId = await GatewayService.createProduct(encryptedGateway, au.churchId);
              if (productId) {
                encryptedGateway.productId = productId;
              }

              return this.repos.gateway.save(encryptedGateway);
            })
          );

          return this.repos.gateway.convertAllToModel(au.churchId, savedGateways as any[]);
        } catch (error: any) {
          return this.json({ message: error?.message || "Failed to save gateway configuration" }, 400);
        }
      }
    });
  }

  @httpPatch("/:id")
  public async update(@requestParam("id") id: string, req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json(null, 401);
      else {
        try {
          const existing = await this.repos.gateway.load(au.churchId, id);
          if (!existing) {
            return this.json({ message: "No gateway found for this church" }, 400);
          }

          if (req.body.id) delete req.body.id;

          const provider = (req.body.provider ?? existing.provider) as string | undefined;
          const settingsSource = req.body.settings !== undefined ? req.body.settings : existing.settings;
          const validatedSettings = this.validateProviderSettings(provider, settingsSource);
          const environment = this.normalizeEnvironment(req.body.environment ?? existing.environment);

          const updatedGateway: Gateway = {
            ...(existing as any),
            ...req.body,
            provider,
            settings: validatedSettings,
            environment,
            churchId: au.churchId
          };

          if (req.body.privateKey !== undefined) {
            const privateKey = typeof req.body.privateKey === "string" ? req.body.privateKey : "";
            updatedGateway.privateKey = privateKey ? EncryptionHelper.encrypt(privateKey) : "";
          }

          if (req.body.webhookKey !== undefined) {
            const webhookKey = typeof req.body.webhookKey === "string" ? req.body.webhookKey : "";
            updatedGateway.webhookKey = webhookKey ? EncryptionHelper.encrypt(webhookKey) : "";
          }

          await this.repos.gateway.save(updatedGateway);
          const refreshed = await this.repos.gateway.load(au.churchId, id);
          return this.repos.gateway.convertToModel(au.churchId, refreshed as any);
        } catch (error: any) {
          return this.json({ message: error?.message || "Failed to update gateway" }, 400);
        }
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json(null, 401);
      else {
        const gateway = (await this.repos.gateway.load(au.churchId, id)) as any;
        if (gateway) {
          await GatewayService.deleteWebhooks(gateway, au.churchId);
        }
        await this.repos.gateway.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  private normalizeSettings(settings: unknown): Record<string, unknown> | null {
    if (settings === null || settings === undefined) return null;

    if (typeof settings === "string") {
      const trimmed = settings.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
        throw new Error("Gateway settings must be a JSON object");
      } catch (error: any) {
        if (error?.message === "Gateway settings must be a JSON object") {
          throw error;
        }
        throw new Error("Gateway settings must be valid JSON");
      }
    }

    if (typeof settings === "object" && !Array.isArray(settings)) {
      return settings as Record<string, unknown>;
    }

    throw new Error("Gateway settings must be an object or JSON string");
  }

  private normalizeEnvironment(environment: unknown): string | null {
    if (environment === null || environment === undefined) return null;
    if (typeof environment !== "string") return null;
    const trimmed = environment.trim();
    return trimmed || null;
  }

  private validateProviderSettings(provider: string | undefined, settings: unknown): Record<string, unknown> | null {
    if (!provider) {
      throw new Error("Provider is required");
    }

    const capabilities = GatewayService.getProviderCapabilities(provider);
    if (!capabilities) {
      throw new Error(`Unsupported gateway provider ${provider}`);
    }

    const normalizedSettings = this.normalizeSettings(settings);
    if (!normalizedSettings) {
      return null;
    }

    const validatedSettings = GatewayService.validateSettings({ provider, settings: normalizedSettings } as any);
    if (!validatedSettings) {
      throw new Error(`Invalid settings for provider ${provider}`);
    }

    return validatedSettings as Record<string, unknown>;
  }
}
