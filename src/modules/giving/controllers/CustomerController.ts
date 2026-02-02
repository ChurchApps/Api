import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { GatewayService } from "../../../shared/helpers/GatewayService.js";

@controller("/giving/customers")
export class CustomerController extends GivingCrudController {
  protected crudSettings = {
    repoKey: "customer",
    permissions: { view: Permissions.donations.viewSummary, edit: Permissions.donations.edit },
    routes: ["getAll", "delete"] as const // no POST; custom GET /:id below
  };
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const customer = await this.repos.customer.convertToModel(au.churchId, (await this.repos.customer.load(au.churchId, id)) as any);
      if (!au.checkAccess(Permissions.donations.viewSummary) && au.personId !== customer.personId) return this.json({}, 401);
      else return customer;
    });
  }

  @httpGet("/:id/subscriptions")
  public async getSubscriptions(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      // Subscriptions are Stripe-only currently
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: "stripe" }, this.repos.gateway).catch(() => null);
      let permission = false;
      if (gateway) {
        if (au.checkAccess(Permissions.donations.viewSummary)) {
          permission = true;
        } else {
          const customerData = await this.repos.customer.load(au.churchId, id);
          if (customerData) {
            const customer = this.repos.customer.convertToModel(au.churchId, customerData as any);
            permission = customer.personId === au.personId;
          }
        }
      }
      if (!permission) return this.json({}, 401);

      // Check if provider supports subscriptions
      const capabilities = GatewayService.getProviderCapabilities(gateway);
      if (!capabilities?.supportsSubscriptions) {
        return []; // Return empty array for providers without subscription support
      }

      return await GatewayService.getCustomerSubscriptions(gateway, id);
    });
  }

  // GET / inherited via enableGetAll=true
  // DELETE /:id inherited via enableDelete=true

}
