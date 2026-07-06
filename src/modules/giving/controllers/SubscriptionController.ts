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

        const provider = subscription.provider;
        let gateway = provider
          ? await GatewayService.getGatewayForChurch(au.churchId, { provider }, this.repos.gateway).catch(() => null)
          : null;

        if (!gateway && existingSub?.customerId) {
          const customer = await this.repos.customer.load(au.churchId, existingSub.customerId) as any;
          if (customer?.provider) {
            gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: customer.provider }, this.repos.gateway).catch(() => null);
          }
        }

        if (!gateway) {
          gateway = await GatewayService.getGatewayForChurch(au.churchId, { requiredCapability: "supportsSubscriptions" }, this.repos.gateway).catch(() => null);
        }

        let permission = au.checkAccess(Permissions.donations.edit) || existingSub?.personId === au.personId;

        // Gateway-created schedules may have no local row; ask the provider to verify ownership.
        if (!permission && !existingSub && gateway) {
          permission = await GatewayService.verifySubscriptionOwnership(gateway, subscription.id, au.personId, this.repos);
        }
        if (!permission) continue;

        if (gateway) {
          promises.push(GatewayService.updateSubscription(gateway, subscription));
        }
      }

      const results = await Promise.all(promises);
      return this.json(results);
    });
  }

  // authz-exempt: gated by resolveSubscriptionForAction(au, id, provider) — donations.edit or subscription owner (au.personId)
  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, { provider?: string; reason?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const provider = req.query?.provider?.toString() || req.body?.provider;
      const resolved = await this.resolveSubscriptionForAction(au, id, provider);
      if (!resolved.permission) return this.json(null, 401);
      if (!resolved.gateway) return this.json({ error: "No gateway configured" }, 400);

      try {
        await GatewayService.cancelSubscription(resolved.gateway, id, req.body?.reason);
        await this.repos.subscription.delete(au.churchId, id);
        return this.json({ success: true });
      } catch (error) {
        console.error("Subscription cancellation failed:", error);
        return this.json({ error: "Subscription cancellation failed" }, 500);
      }
    });
  }

  // authz-exempt: gated by resolveSubscriptionForAction(au, id, provider) — donations.edit or subscription owner (au.personId)
  @httpPost("/:id/pause")
  public async pause(@requestParam("id") id: string, req: express.Request<{}, {}, { provider?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const provider = req.query?.provider?.toString() || req.body?.provider;
      const resolved = await this.resolveSubscriptionForAction(au, id, provider);
      if (!resolved.permission) return this.json(null, 401);
      if (!resolved.gateway) return this.json({ error: "No gateway configured" }, 400);

      try {
        await GatewayService.pauseSubscription(resolved.gateway, id);
        return this.json({ success: true });
      } catch (error) {
        console.error("Subscription pause failed:", error);
        return this.json({ error: "Subscription pause failed" }, 500);
      }
    });
  }

  // authz-exempt: gated by resolveSubscriptionForAction(au, id, provider) — donations.edit or subscription owner (au.personId)
  @httpPost("/:id/resume")
  public async resume(@requestParam("id") id: string, req: express.Request<{}, {}, { provider?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const provider = req.query?.provider?.toString() || req.body?.provider;
      const resolved = await this.resolveSubscriptionForAction(au, id, provider);
      if (!resolved.permission) return this.json(null, 401);
      if (!resolved.gateway) return this.json({ error: "No gateway configured" }, 400);

      try {
        await GatewayService.resumeSubscription(resolved.gateway, id);
        return this.json({ success: true });
      } catch (error) {
        console.error("Subscription resume failed:", error);
        return this.json({ error: "Subscription resume failed" }, 500);
      }
    });
  }

  // Shared by delete/pause/resume; verifies donations.edit or ownership (gateway-created schedules via provider).
  private async resolveSubscriptionForAction(au: any, id: string, provider?: string): Promise<{ subscription: any; gateway: any; permission: boolean }> {
    const subscription = await this.repos.subscription.load(au.churchId, id) as any;
    let permission = au.checkAccess(Permissions.donations.edit) || subscription?.personId === au.personId;

    let gateway = provider
      ? await GatewayService.getGatewayForChurch(au.churchId, { provider }, this.repos.gateway).catch(() => null)
      : null;

    if (!permission && !subscription && gateway) {
      permission = await GatewayService.verifySubscriptionOwnership(gateway, id, au.personId, this.repos);
    }

    if (!permission) return { subscription, gateway: null, permission: false };

    if (!gateway && subscription?.customerId) {
      const customer = await this.repos.customer.load(au.churchId, subscription.customerId) as any;
      if (customer?.provider) {
        gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: customer.provider }, this.repos.gateway).catch(() => null);
      }
    }

    if (!gateway) {
      gateway = await GatewayService.getGatewayForChurch(au.churchId, { requiredCapability: "supportsSubscriptions" }, this.repos.gateway).catch(() => null);
    }

    return { subscription, gateway, permission: true };
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
