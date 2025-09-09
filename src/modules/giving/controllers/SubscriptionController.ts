import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController";
import { Permissions } from "../../../shared/helpers/Permissions";
import { GatewayService } from "../../../shared/helpers/GatewayService";
import { EncryptionHelper } from "@churchapps/apihelper";

@controller("/giving/subscriptions")
export class SubscriptionController extends GivingBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json(null, 401);
      else return this.repositories.customer.convertToModel(au.churchId, await this.repositories.customer.load(au.churchId, id));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json(null, 401);
      else return this.repositories.customer.convertAllToModel(au.churchId, (await this.repositories.customer.loadAll(au.churchId)) as any[]);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, any[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      let permission = au.checkAccess(Permissions.donations.edit);
      const promises: Promise<any>[] = [];
      // Note: Subscription updates would need to be implemented in the gateway providers
      // This is a placeholder for future implementation
      req.body.forEach(async (subscription) => {
        permission = permission || ((await this.repositories.subscription.load(au.churchId, subscription.id)) as any).personId === au.personId;
        // TODO: Implement gateway-agnostic subscription updates
      });
      return await Promise.all(promises);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, { provider?: string; reason?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const subscription = await this.repositories.subscription.load(au.churchId, id);
      const permission = au.checkAccess(Permissions.donations.edit) || (subscription as any)?.personId === au.personId;
      if (!permission) return this.json(null, 401);

      const gateways = await this.repositories.gateway.loadAll(au.churchId);
      const gateway = (gateways as any[])[0];
      if (!gateway) return this.json({ error: "No gateway configured" }, 400);

      try {
        const promises: Promise<any>[] = [];

        // Cancel subscription with the gateway
        promises.push(GatewayService.cancelSubscription(gateway, id, req.body?.reason));

        // Delete from database
        promises.push(this.repositories.subscription.delete(au.churchId, id));

        await Promise.all(promises);
        return this.json({ success: true });
      } catch (error) {
        console.error("Subscription cancellation failed:", error);
        return this.json({ error: "Subscription cancellation failed" }, 500);
      }
    });
  }

  private loadPrivateKey = async (churchId: string) => {
    const gateways = await this.repositories.gateway.loadAll(churchId);
    return (gateways as any[]).length === 0 ? "" : EncryptionHelper.decrypt((gateways as any[])[0].privateKey);
  };
}
