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
      // Check permissions
      let permission = au.checkAccess(Permissions.donations.viewSummary);
      if (!permission) {
        const customerData = await this.repos.customer.load(au.churchId, id);
        if (customerData) {
          const customer = this.repos.customer.convertToModel(au.churchId, customerData as any);
          permission = customer.personId === au.personId;
        }
      }
      if (!permission) return this.json({}, 401);

      // Look up the person associated with the requested customer
      const customerRecord = await this.repos.customer.load(au.churchId, id) as any;
      const personId = customerRecord?.personId || au.personId;

      // Load all gateways and fetch subscriptions from each that supports them
      const allGateways = (await this.repos.gateway.loadAll(au.churchId)) as any[];
      const allSubscriptions: any[] = [];

      // If no gateways are configured, return empty array (church hasn't set up giving)
      if (!allGateways || allGateways.length === 0) {
        console.warn(`getSubscriptions: no gateways configured for churchId=${au.churchId}`);
        return [];
      }

      for (const gw of allGateways) {
        const capabilities = GatewayService.getProviderCapabilities(gw);
        if (!capabilities?.supportsSubscriptions) continue;

        try {
          // Find the correct customer ID for this specific gateway/provider
          let gatewayCustomerId = id; // default to the passed-in ID (works for Stripe)
          if (gw.provider?.toLowerCase() !== "stripe") {
            const providerCustomer = await this.repos.customer.loadByPersonAndProvider(au.churchId, personId, gw.provider) as any;
            if (!providerCustomer) continue; // no customer on this provider, skip
            gatewayCustomerId = providerCustomer.id;
          }

          const gateway = await GatewayService.getGatewayForChurch(au.churchId, { gatewayId: gw.id }, this.repos.gateway);

          let result: any;
          try {
            result = await GatewayService.getCustomerSubscriptions(gateway, gatewayCustomerId);
          } catch (subErr: any) {
            // Customer doesn't exist on the provider — skip this gateway
            if (subErr.response?.status === 404) {
              console.warn(`Customer ${gatewayCustomerId} not found on ${gw.provider} for subscriptions, skipping.`);
              continue;
            }
            throw subErr;
          }

          // Handle Stripe format ({ data: [...] }) and KF format (array)
          const subs = Array.isArray(result) ? result : (result?.data || []);

          for (const sub of subs) {
            const providerName = gw.provider?.toLowerCase();

            if (providerName === "kingdomfunding") {
              // The provider marks cancelled/expired schedules active:false — skip those.
              if (!sub.active) continue;

              // Normalize the NMI recurring schedule to the Stripe-like shape the UI expects.
              // Use next_run_date so the "Start Date" column shows the next charge date.
              const amountCents = Math.round((sub.amount || 0) * 100);
              const anchorSrc = sub.next_run_date || sub.created_at;
              const freq = this.mapKFFrequency(sub.frequency);
              allSubscriptions.push({
                id: String(sub.id),
                status: "active",
                billing_cycle_anchor: anchorSrc
                  ? Math.floor(new Date(anchorSrc).getTime() / 1000)
                  : Math.floor(Date.now() / 1000),
                default_payment_method: sub.payment_method_id ? String(sub.payment_method_id) : undefined,
                plan: {
                  amount: amountCents,
                  interval: freq.interval,
                  interval_count: freq.interval_count
                },
                provider: providerName,
                gatewayId: gw.id
              });
            } else {
              allSubscriptions.push({ ...sub, provider: providerName, gatewayId: gw.id });
            }
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

  /** Map Kingdom Funding (NMI) frequency names to a Stripe-compatible interval + count. */
  private mapKFFrequency(frequency: string): { interval: string; interval_count: number } {
    switch (frequency?.toLowerCase()) {
      case "daily": return { interval: "day", interval_count: 1 };
      case "weekly": return { interval: "week", interval_count: 1 };
      case "biweekly": return { interval: "week", interval_count: 2 };
      case "monthly": return { interval: "month", interval_count: 1 };
      case "bimonthly": return { interval: "month", interval_count: 2 };
      case "quarterly": return { interval: "month", interval_count: 3 };
      case "biannually": return { interval: "month", interval_count: 6 };
      case "annually": return { interval: "year", interval_count: 1 };
      default: return { interval: "month", interval_count: 1 };
    }
  }
}
