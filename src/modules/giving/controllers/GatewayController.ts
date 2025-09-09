import { controller, httpPost, httpGet, requestParam, httpDelete, httpPatch } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController";
import { Gateway } from "../models";
import { GatewayService } from "../../../shared/helpers/GatewayService";
import { EncryptionHelper } from "@churchapps/apihelper";
import { Permissions } from "../../../shared/helpers/Permissions";

@controller("/giving/gateways")
export class GatewayController extends GivingBaseController {
  @httpGet("/churchId/:churchId")
  public async getForChurch(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return this.repositories.gateway.convertAllToModel(churchId, (await this.repositories.gateway.loadAll(churchId)) as any[]);
    });
  }

  @httpGet("/configured/:churchId")
  public async isConfigured(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const gateways = (await this.repositories.gateway.loadAll(churchId)) as any[];
      const hasConfiguredGateway = gateways.length > 0 && gateways.some((g: any) => g.privateKey && g.privateKey.trim() !== "");
      return { configured: hasConfiguredGateway };
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json(null, 401);
      else {
        return this.repositories.gateway.convertToModel(au.churchId, await this.repositories.gateway.load(au.churchId, id));
      }
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return this.repositories.gateway.convertAllToModel(au.churchId, (await this.repositories.gateway.loadAll(au.churchId)) as any[]);
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
            if (req.hostname !== "localhost") {
              // Delete existing webhooks
              await GatewayService.deleteWebhooks(gateway, au.churchId);

              // Create new webhook
              const providerName = gateway.provider.toLowerCase();
              const webHookUrl = req.get("x-forwarded-proto") + "://" + req.hostname + `/donate/webhook/${providerName}?churchId=` + au.churchId;
              const webhook = await GatewayService.createWebhook(gateway, webHookUrl);

              if (webhook.secret) {
                gateway.webhookKey = EncryptionHelper.encrypt(webhook.secret);
              } else {
                gateway.webhookKey = EncryptionHelper.encrypt(webhook.id);
              }
            }

            // Create product if the gateway supports it
            const productId = await GatewayService.createProduct(gateway, au.churchId);
            if (productId) {
              gateway.productId = productId;
            }

            gateway.churchId = au.churchId;
            gateway.privateKey = EncryptionHelper.encrypt(gateway.privateKey as string);
            promises.push(this.repositories.gateway.save(gateway));
          })
        );
        const result = await Promise.all(promises);
        return this.repositories.gateway.convertAllToModel(au.churchId, result as any[]);
      }
    });
  }

  @httpPatch("/:id")
  public async update(@requestParam("id") id: string, req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json(null, 401);
      else {
        const existing = await this.repositories.gateway.load(au.churchId, id);
        if (!existing) {
          return this.json({ message: "No gateway found for this church" }, 400);
        } else {
          if (req.body.id) delete req.body.id;
          const updatedGateway: Gateway = {
            ...(existing as any),
            ...req.body
          };
          await this.repositories.gateway.save(updatedGateway);
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
        const gateway = (await this.repositories.gateway.load(au.churchId, id)) as any;
        if (gateway) {
          await GatewayService.deleteWebhooks(gateway, au.churchId);
        }
        await this.repositories.gateway.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
