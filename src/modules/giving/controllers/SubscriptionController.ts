import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController";
import { Permissions } from "../../../shared/helpers/Permissions";
import { GatewayService } from "../../../shared/helpers/GatewayService";
import { EncryptionHelper } from "@churchapps/apihelper";

@controller("/giving/subscriptions")
export class SubscriptionController extends GivingCrudController {
  protected crudSettings = {
    repoKey: "subscription",
    permissions: { view: Permissions.donations.viewSummary, edit: Permissions.donations.edit },
    routes: [] as const
  };
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
      const gateways = await this.repos.gateway.loadAll(au.churchId);
      const gateway = (gateways as any[])[0];

      if (!gateway) return this.json({ error: "No gateway configured" }, 400);

      for (const subscription of req.body) {
        const existingSub = await this.repos.subscription.load(au.churchId, subscription.id);
        const permission = au.checkAccess(Permissions.donations.edit) || (existingSub as any)?.personId === au.personId;

        if (permission) {
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
      const subscription = await this.repos.subscription.load(au.churchId, id);
      const permission = au.checkAccess(Permissions.donations.edit) || (subscription as any)?.personId === au.personId;
      if (!permission) return this.json(null, 401);

      const gateways = await this.repos.gateway.loadAll(au.churchId);
      const gateway = (gateways as any[])[0];
      if (!gateway) return this.json({ error: "No gateway configured" }, 400);

      try {
        const promises: Promise<any>[] = [];

        // Cancel subscription with the gateway
        promises.push(GatewayService.cancelSubscription(gateway, id, req.body?.reason));

        // Delete from database
        promises.push(this.repos.subscription.delete(au.churchId, id));

        await Promise.all(promises);
        return this.json({ success: true });
      } catch (error) {
        console.error("Subscription cancellation failed:", error);
        return this.json({ error: "Subscription cancellation failed" }, 500);
      }
    });
  }

  private loadPrivateKey = async (churchId: string) => {
    const gateways = await this.repos.gateway.loadAll(churchId);
    return (gateways as any[]).length === 0 ? "" : EncryptionHelper.decrypt((gateways as any[])[0].privateKey);
  };
}
