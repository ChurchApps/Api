import { controller, httpGet, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { GatewayService } from "../../../shared/helpers/GatewayService.js";

@controller("/giving/customers")
export class CustomerController extends GivingBaseController {

  @httpGet("/:id/subscriptions")
  public async getSubscriptions(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      let permission = au.checkAccess(Permissions.donations.viewSummary);
      if (!permission) {
        const customerData = await this.repos.customer.load(au.churchId, id);
        if (customerData) {
          const customer = this.repos.customer.convertToModel(au.churchId, customerData as any);
          permission = customer.personId === au.personId;
        }
      }
      if (!permission) return this.json({}, 401);

      const customerRecord = await this.repos.customer.load(au.churchId, id) as any;
      const personId = customerRecord?.personId || au.personId;

      const allGateways = (await this.repos.gateway.loadAll(au.churchId)) as any[];
      const allSubscriptions: any[] = [];

      // If no gateways are configured, return empty array (church hasn't set up giving)
      if (!allGateways || allGateways.length === 0) {
        console.warn(`getSubscriptions: no gateways configured for churchId=${au.churchId}`);
        return [];
      }

      // The passed-in customer id belongs to one provider; other gateways resolve theirs by person.
      const passedCustomer = customerRecord;

      for (const gw of allGateways) {
        const capabilities = GatewayService.getProviderCapabilities(gw);
        if (!capabilities?.supportsSubscriptions) continue;

        try {
          // Find the correct customer ID for this specific gateway/provider
          let gatewayCustomerId: string | null = null;
          if (passedCustomer && passedCustomer.provider?.toLowerCase() === gw.provider?.toLowerCase()) {
            gatewayCustomerId = id;
          } else {
            const providerCustomer = await this.repos.customer.loadByPersonAndProvider(au.churchId, personId, gw.provider) as any;
            if (providerCustomer) gatewayCustomerId = providerCustomer.id;
          }
          if (!gatewayCustomerId) continue; // no customer on this provider, skip

          const gateway = await GatewayService.getGatewayForChurch(au.churchId, { gatewayId: gw.id }, this.repos.gateway);

          let subs: any[];
          try {
            subs = await GatewayService.listNormalizedSubscriptions(gateway, gatewayCustomerId);
          } catch (subErr: any) {
            // Customer doesn't exist on the provider — skip this gateway
            if (subErr.response?.status === 404) {
              console.warn(`Customer ${gatewayCustomerId} not found on ${gw.provider} for subscriptions, skipping.`);
              continue;
            }
            throw subErr;
          }

          for (const sub of subs) {
            allSubscriptions.push({ ...sub, provider: gw.provider?.toLowerCase(), gatewayId: gw.id });
          }
        } catch (e) {
          console.warn(`Failed to load subscriptions from ${gw.provider}:`, e);
        }
      }

      // Return in { data: [...] } format for frontend compatibility
      return { data: allSubscriptions };
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const customer = await this.repos.customer.convertToModel(au.churchId, (await this.repos.customer.load(au.churchId, id)) as any);
      if (!au.checkAccess(Permissions.donations.viewSummary) && au.personId !== customer.personId) return this.json({}, 401);
      else return customer;
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json([], 401);
      const data = await this.repos.customer.loadAll(au.churchId);
      return this.repos.customer.convertAllToModel(au.churchId, data);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      await this.repos.customer.delete(au.churchId, id);
      return {};
    });
  }

}
