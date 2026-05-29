import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { GatewayService } from "../../../shared/helpers/GatewayService.js";
import { EncryptionHelper } from "@churchapps/apihelper";

@controller("/giving/subscriptions")
export class SubscriptionController extends GivingBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json(null, 401);
      else return this.repos.customer.convertToModel(au.churchId, await this.repos.customer.load(au.churchId, id));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json(null, 401);
      else return this.repos.customer.convertAllToModel(au.churchId, (await this.repos.customer.loadAll(au.churchId)) as any[]);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, any[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<any>[] = [];

      for (const subscription of req.body) {
        const existingSub = await this.repos.subscription.load(au.churchId, subscription.id) as any;
        const permission = au.checkAccess(Permissions.donations.edit) || existingSub?.personId === au.personId;
        if (!permission) continue;

        // Resolve gateway via provider param or by looking up the customer's provider
        const provider = subscription.provider;
        let gateway = provider
          ? await GatewayService.getGatewayForChurch(au.churchId, { provider }, this.repos.gateway).catch(() => null)
          : null;

        if (!gateway && existingSub?.customerId) {
          // Look up customer to determine which provider this subscription belongs to
          const customer = await this.repos.customer.load(au.churchId, existingSub.customerId) as any;
          const custProvider = customer?.provider || "stripe";
          gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: custProvider }, this.repos.gateway).catch(() => null);
        }

        if (!gateway) {
          gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: "stripe" }, this.repos.gateway).catch(() => null);
        }

        if (gateway) {
          promises.push(GatewayService.updateSubscription(gateway, subscription));
        }
      }

      const results = await Promise.all(promises);
      return this.json(results);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, { provider?: string; reason?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const subscription = await this.repos.subscription.load(au.churchId, id) as any;
      const permission = au.checkAccess(Permissions.donations.edit) || subscription?.personId === au.personId;
      if (!permission) return this.json(null, 401);

      // Resolve gateway via provider query/body param or by looking up the customer's provider
      const provider = req.query?.provider?.toString() || req.body?.provider;
      let gateway = provider
        ? await GatewayService.getGatewayForChurch(au.churchId, { provider }, this.repos.gateway).catch(() => null)
        : null;

      if (!gateway && subscription?.customerId) {
        const customer = await this.repos.customer.load(au.churchId, subscription.customerId) as any;
        const custProvider = customer?.provider || "stripe";
        gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: custProvider }, this.repos.gateway).catch(() => null);
      }

      if (!gateway) {
        gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: "stripe" }, this.repos.gateway).catch(() => null);
      }

      if (!gateway) return this.json({ error: "No gateway configured" }, 400);

      try {
        // Cancel subscription with the gateway
        await GatewayService.cancelSubscription(gateway, id, req.body?.reason);
        // Delete from database
        await this.repos.subscription.delete(au.churchId, id);
        return this.json({ success: true });
      } catch (error) {
        console.error("Subscription cancellation failed:", error);
        return this.json({ error: "Subscription cancellation failed" }, 500);
      }
    });
  }

  private loadPrivateKey = async (churchId: string) => {
    const gateway = await GatewayService.getGatewayForChurch(churchId, {}, this.repos.gateway).catch(() => null);
    if (!gateway || !gateway.privateKey) return "";

    try {
      return EncryptionHelper.decrypt(gateway.privateKey);
    } catch {
      return "";
    }
  };
}
