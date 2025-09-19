import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController";
import { Permissions } from "../../../shared/helpers/Permissions";
import { GatewayService } from "../../../shared/helpers/GatewayService";

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
      const gateways = (await this.repos.gateway.loadAll(au.churchId)) as any[];
      let permission = false;
      if (gateways.length > 0) {
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
      else {
        const gateway = gateways[0];
        return await GatewayService.getCustomerSubscriptions(gateway, id);
      }
    });
  }

  // GET / inherited via enableGetAll=true
  // DELETE /:id inherited via enableDelete=true

}
