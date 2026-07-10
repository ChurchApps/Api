import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { GatewayService } from "../../../shared/helpers/GatewayService.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { GatewayPaymentMethod } from "../models/index.js";

@controller("/giving/paymentmethods")
export class PaymentMethodController extends GivingBaseController {

  @httpGet("/personid/:id")
  public async getPersonPaymentMethods(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.view) && id !== au.personId) return this.json({}, 401);

      const allGateways = (await this.repos.gateway.loadAll(au.churchId)) as any[];
      if (!allGateways?.length) return [];

      const normalizedMethods: any[] = [];

      for (const gw of allGateways) {
        const capabilities = GatewayService.getProviderCapabilities(gw);
        if (!capabilities?.supportsVault) continue;

        let customer = await this.repos.customer.loadByPersonAndProvider(au.churchId, id, gw.provider);
        if (!customer) customer = await this.repos.customer.loadByPersonId(au.churchId, id);
        if (!customer) continue;

        try {
          const gateway = await GatewayService.getGatewayForChurch(au.churchId, { gatewayId: gw.id }, this.repos.gateway);
          normalizedMethods.push(...await GatewayService.listNormalizedPaymentMethods(gateway, customer, this.repos));
        } catch (e) {
          console.warn(`Failed to load payment methods for gateway ${gw.id} (${gw.provider}):`, e);
        }
      }

      return normalizedMethods;
    });
  }

  @httpPost("/addcard")
  public async addCard(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      // authz-exempt: anonymous guest giving has no au.churchId; body churchId is the only source, scoped to the gateway lookup below
      const { id, personId, customerId, email, name, churchId, provider } = req.body;
      const cId = au?.churchId || churchId;
      // Resolve by requested provider, else any vault-capable gateway.
      const gateway = await GatewayService.getGatewayForChurch(
        cId,
        provider ? { provider } : { requiredCapability: "supportsVault" },
        this.repos.gateway
      ).catch((): null => null);

      if (!gateway) {
        return this.json({ error: "Payment gateway not configured" }, 400);
      }

      const capabilities = GatewayService.getProviderCapabilities(gateway);
      if (!capabilities?.supportsVault) {
        return this.json({ error: `${gateway.provider} does not support stored payment methods` }, 400);
      }

      const tokenError = GatewayService.validateAttachToken(gateway, id);
      if (tokenError) return this.json({ error: tokenError }, 400);

      let customer = await GatewayService.resolveCustomerForAttach(gateway, personId, customerId, this.repos);
      if (!customer) {
        try {
          customer = await GatewayService.createCustomer(gateway, email, name, { personId });
          if (customer) {
            await this.repos.customer.save({ id: customer, churchId: cId, personId, provider: gateway.provider });
          }
        } catch (e: any) {
          return this.json({ error: "Failed to create customer", details: e.message }, 500);
        }
      }

      try {
        let pm: any;
        try {
          pm = await GatewayService.attachPaymentMethod(gateway, id, GatewayService.buildAttachOptions(gateway, customer, id, req.body));
        } catch (attachErr: any) {
          const status = attachErr.response?.status || attachErr.statusCode;
          if (status === 404 && GatewayService.recreatesMissingCustomers(gateway)) {
            console.log(`Customer ${customer} not found on ${gateway.provider}, recreating...`);
            const newCustomer = await GatewayService.createCustomer(gateway, email, name);
            if (newCustomer) {
              await this.repos.customer.save({ id: newCustomer, churchId: cId, personId, provider: gateway.provider });
              customer = newCustomer;
              pm = await GatewayService.attachPaymentMethod(gateway, id, GatewayService.buildAttachOptions(gateway, customer, id, req.body));
            } else {
              throw attachErr;
            }
          } else {
            throw attachErr;
          }
        }

        // Persist a local display record for providers that track saved methods locally.
        const tokenId = pm?.id ? String(pm.id) : id;
        const localRecord = customer && tokenId ? GatewayService.buildLocalMethodRecord(gateway, pm, req.body, tokenId) : null;
        if (localRecord) {
          const existing = await this.repos.gatewayPaymentMethod.loadByExternalId(cId, gateway.id, tokenId);
          const record: GatewayPaymentMethod = {
            id: existing?.id,
            churchId: cId,
            gatewayId: gateway.id,
            customerId: customer,
            externalId: tokenId,
            ...localRecord
          };
          await this.repos.gatewayPaymentMethod.save(record);
        }

        return { paymentMethod: pm, customerId: customer };
      } catch (e: any) {
        const mapped = GatewayService.mapGatewayError(gateway, e);
        if (mapped) return this.json(mapped.body, mapped.status);

        // Return generic error for other cases
        return this.json({
          error: e.message || "Failed to attach payment method",
          code: e.code || "unknown_error"
        }, e.statusCode || 500);
      }
    });
  }

  @httpPost("/updatecard")
  public async updateCard(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { personId, paymentMethodId, cardData, provider } = req.body;
      const gateway = await GatewayService.getGatewayForChurch(
        au.churchId,
        provider ? { provider } : { requiredCapability: "supportsVault" },
        this.repos.gateway
      ).catch((): null => null);
      const permission = gateway && (au.checkAccess(Permissions.donations.edit) || personId === au.personId);
      if (!permission) return this.json({ error: "Insufficient permissions" }, 401);
      try {
        return await GatewayService.updateCard(gateway, paymentMethodId, cardData);
      } catch (e: any) {
        console.error("Error updating card:", e);
        const mapped = GatewayService.mapGatewayError(gateway, e);
        if (mapped) return this.json(mapped.body, mapped.status);
        return this.json({
          error: e.message || "Failed to update card",
          code: e.code || "unknown_error"
        }, e.statusCode || 500);
      }
    });
  }

  @httpPost("/ach-setup-intent")
  public async createACHSetupIntent(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      // authz-exempt: gated to au.personId or donations.edit below; cId prefers au.churchId, body churchId only a fallback
      const { personId, customerId, email, name, churchId } = req.body;
      const cId = au?.churchId || churchId;
      const gateway = await GatewayService.getGatewayForChurch(cId, { requiredCapability: "supportsACH" }, this.repos.gateway).catch((): null => null);

      if (!gateway) {
        return this.json({ error: "Payment gateway not configured" }, 400);
      }

      const permission = au.checkAccess(Permissions.donations.edit) || personId === au.personId;
      if (!permission) return this.json({ error: "Insufficient permissions" }, 401);

      if (!GatewayService.supportsACHSetupIntent(gateway)) {
        return this.json({ error: `${gateway.provider} does not support ACH SetupIntent` }, 400);
      }

      let customer = customerId;
      if (!customer) {
        const existingCustomer = await this.repos.customer.loadByPersonAndProvider(cId, personId, gateway.provider)
          || await this.repos.customer.loadByPersonId(cId, personId);

        if (existingCustomer?.id) {
          customer = existingCustomer.id;
        } else {
          try {
            customer = await GatewayService.createCustomer(gateway, email, name);
            if (customer) {
              await this.repos.customer.save({ id: customer, churchId: cId, personId, provider: gateway.provider });
            }
          } catch (e: any) {
            console.error("Error creating customer:", e);
            return this.json({ error: "Failed to create customer", details: e.message }, 500);
          }
        }
      }

      try {
        const setupIntent = await GatewayService.createACHSetupIntent(gateway, customer);
        return {
          clientSecret: setupIntent.client_secret,
          setupIntentId: setupIntent.id,
          customerId: customer
        };
      } catch (e: any) {
        console.error("Error creating ACH SetupIntent:", e);
        return this.json({
          error: e.message || "Failed to create ACH SetupIntent",
          code: e.code || "unknown_error"
        }, e.statusCode || 500);
      }
    });
  }

  @httpPost("/ach-setup-intent-anon")
  public async createACHSetupIntentAnon(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      // authz-exempt: public guest-donation flow; churchId required to resolve the public widget gateway
      const { email, name, churchId, gatewayId } = req.body;

      if (!churchId) {
        return this.json({ error: "Church ID is required" }, 400);
      }

      if (!email || !name) {
        return this.json({ error: "Email and name are required" }, 400);
      }

      const gateway = await GatewayService.getGatewayForChurch(churchId, { gatewayId }, this.repos.gateway).catch((): null => null);

      if (!gateway) {
        return this.json({ error: "Payment gateway not configured" }, 400);
      }

      if (!GatewayService.supportsACHSetupIntent(gateway)) {
        return this.json({ error: `${gateway.provider} does not support ACH SetupIntent` }, 400);
      }

      try {
        const gatewayCustomerId = await GatewayService.createCustomer(gateway, email, name);

        const setupIntent = await GatewayService.createACHSetupIntent(gateway, gatewayCustomerId);
        return {
          clientSecret: setupIntent.client_secret,
          setupIntentId: setupIntent.id,
          customerId: gatewayCustomerId
        };
      } catch (e: any) {
        console.error("Error creating anonymous ACH SetupIntent:", e);
        return this.json({
          error: e.message || "Failed to create ACH SetupIntent",
          code: e.code || "unknown_error"
        }, e.statusCode || 500);
      }
    });
  }

  @httpPost("/addbankaccount")
  public async addBankAccount(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { id, personId, customerId, email, name } = req.body;
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { requiredCapability: "supportsACH" }, this.repos.gateway).catch((): null => null);
      const permission = gateway && (au.checkAccess(Permissions.donations.edit) || personId === au.personId);
      if (!permission) return this.json({ error: "Insufficient permissions" }, 401);

      const capabilities = GatewayService.getProviderCapabilities(gateway);
      if (!capabilities?.supportsACH) {
        return this.json({ error: `${gateway.provider} does not support bank account payments` }, 400);
      }
      let customer = customerId;
      if (!customer) {
        try {
          customer = await GatewayService.createCustomer(gateway, email, name);
          if (customer) {
            await this.repos.customer.save({ id: customer, churchId: au.churchId, personId, provider: gateway.provider });
          }
        } catch (e: any) {
          console.error("Error creating customer:", e);
          return this.json({ error: "Failed to create customer", details: e.message }, 500);
        }
      }

      try {
        return await GatewayService.createBankAccount(gateway, customer, { source: id });
      } catch (e: any) {
        console.error("Error adding bank account:", e);
        if (e.type === "StripeInvalidRequestError" && e.code === "resource_missing") {
          return this.json({
            error: "Bank account token not found or expired",
            code: "bank_token_invalid"
          }, 404);
        }
        return this.json({
          error: e.message || "Failed to add bank account",
          code: e.code || "unknown_error"
        }, e.statusCode || 500);
      }
    });
  }

  @httpPost("/updatebank")
  public async updateBank(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { paymentMethodId, personId, bankData, customerId } = req.body;
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { requiredCapability: "supportsACH" }, this.repos.gateway).catch((): null => null);
      const permission = gateway && (au.checkAccess(Permissions.donations.edit) || personId === au.personId);
      if (!permission) return this.json({}, 401);
      try {
        return await GatewayService.updateBank(gateway, paymentMethodId, bankData, customerId);
      } catch (e) {
        return e;
      }
    });
  }

  @httpPost("/verifybank")
  public async verifyBank(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { paymentMethodId, customerId, amountData } = req.body;
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { requiredCapability: "supportsACH" }, this.repos.gateway).catch((): null => null);
      const permission =
        gateway &&
        (au.checkAccess(Permissions.donations.edit) || (await this.repos.customer.convertToModel(au.churchId, await this.repos.customer.load(au.churchId, customerId)).personId) === au.personId);
      if (!permission) return this.json({}, 401);
      else {
        try {
          return await GatewayService.verifyBank(gateway, paymentMethodId, amountData, customerId);
        } catch (e) {
          return e;
        }
      }
    });
  }

  @httpDelete("/:id/:customerid")
  public async deletePaymentMethod(@requestParam("id") id: string, @requestParam("customerid") customerId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const providerParam = (req.query as any).provider?.toLowerCase();
      let resolvedProvider = providerParam || GatewayService.inferProviderFromMethodId(id);

      if (!resolvedProvider) {
        const localRecord = await this.repos.gatewayPaymentMethod.loadByExternalIdAcrossGateways(au.churchId, id);
        if (localRecord) {
          const gw = (await this.repos.gateway.loadAll(au.churchId) as any[]).find(g => g.id === localRecord.gatewayId);
          resolvedProvider = gw?.provider?.toLowerCase();
        }
      }

      const gateway = await GatewayService.getGatewayForChurch(
        au.churchId,
        resolvedProvider ? { provider: resolvedProvider } : { requiredCapability: "supportsVault" },
        this.repos.gateway
      ).catch((): null => null);

      let permission = false;
      if (gateway) {
        if (au.checkAccess(Permissions.donations.edit)) {
          permission = true;
        } else {
          try {
            const customerData = await this.repos.customer.load(au.churchId, customerId);
            if (customerData) {
              const customer = this.repos.customer.convertToModel(au.churchId, customerData as any);
              // A non-admin must own the customer AND the payment method must belong to that
              // customer — otherwise a donor could delete another donor's PM by supplying their
              // own customerId (which passes the personId check) with the victim's PM id.
              if (customer.personId === au.personId) {
                permission = await GatewayService.verifyMethodOwnership(gateway, id, customerId, this.repos);
              }
            }
          } catch (permErr) {
            console.error("[PM Delete] Permission check error:", permErr);
          }
        }
      }
      if (!permission) return this.json({}, 401);

      try {
        await GatewayService.deletePaymentMethod(gateway, id, customerId, this.repos);
        return this.json({});
      } catch (e: any) {
        return this.json({
          error: e?.message || "Failed to delete payment method",
          code: e?.code || "unknown_error"
        }, e?.statusCode || 500);
      }
    });
  }

}
