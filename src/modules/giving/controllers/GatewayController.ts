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
        const promises: Promise<Gateway>[] = [];
        await Promise.all(
          req.body.map(async (gateway) => {
            // Encrypt the private key immediately so it's always encrypted when passed to GatewayService
            const encryptedGateway = {
              ...gateway,
              privateKey: EncryptionHelper.encrypt(gateway.privateKey as string),
              webhookKey: gateway.webhookKey ? EncryptionHelper.encrypt(gateway.webhookKey as string) : ""
            };

            if (req.hostname !== "localhost") {
              // Delete existing webhooks
              console.log("Before delete");
              await GatewayService.deleteWebhooks(encryptedGateway, au.churchId);
              console.log("DELETED WEBHOOKS");

              // Create new webhook
              const providerName = gateway.provider.toLowerCase();
              console.log("PROVIDER NAME", providerName);
              const webHookUrl = req.get("x-forwarded-proto") + "://" + req.hostname + `/donate/webhook/${providerName}?churchId=` + au.churchId;
              console.log("WEBHOOK URL", webHookUrl);
              const webhook = await GatewayService.createWebhook(encryptedGateway, webHookUrl);
              console.log("WEBHOOK", webhook);

              if (webhook.secret) {
                encryptedGateway.webhookKey = EncryptionHelper.encrypt(webhook.secret);
              } else {
                encryptedGateway.webhookKey = EncryptionHelper.encrypt(webhook.id);
              }
            }

            // Create product if the gateway supports it
            const productId = await GatewayService.createProduct(encryptedGateway, au.churchId);
            if (productId) {
              encryptedGateway.productId = productId;
            }

            encryptedGateway.churchId = au.churchId;
            promises.push(this.repos.gateway.save(encryptedGateway));
          })
        );
        const result = await Promise.all(promises);
        return this.repos.gateway.convertAllToModel(au.churchId, result as any[]);
      }
    });
  }

  @httpPatch("/:id")
  public async update(@requestParam("id") id: string, req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json(null, 401);
      else {
        const existing = await this.repos.gateway.load(au.churchId, id);
        if (!existing) {
          return this.json({ message: "No gateway found for this church" }, 400);
        } else {
          if (req.body.id) delete req.body.id;
          const updatedGateway: Gateway = {
            ...(existing as any),
            ...req.body
          };
          await this.repos.gateway.save(updatedGateway);
        }
        return existing;
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
}
