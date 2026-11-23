import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { GatewayService } from "../../../shared/helpers/GatewayService.js";
import type { GatewayObject, NormalizedPaymentMethod } from "../../../shared/helpers/gateways/IGatewayProvider.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { AuthenticatedUser } from "@churchapps/apihelper";
import { Customer, Gateway, GatewayPaymentMethod } from "../models/index.js";
import { AchSetupIntentRequest, AddBankAccountRequest, AddCardRequest, BankChangeRequest, GatewayError, UpdateCardRequest } from "./types.js";
import { DonationRateLimiter } from "../helpers/DonationRateLimiter.js";
import { CaptchaPass } from "../../../shared/helpers/CaptchaPass.js";

@controller("/giving/paymentmethods")
export class PaymentMethodController extends GivingBaseController {

  @httpGet("/personid/:id")
  public async getPersonPaymentMethods(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.view) && id !== au.personId) return this.json({}, 401);

      const allGateways: Gateway[] = await this.repos.gateway.loadAll(au.churchId);
      if (!allGateways?.length) return [];

      const normalizedMethods: NormalizedPaymentMethod[] = [];

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
  public async addCard(req: express.Request<{}, {}, AddCardRequest>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      // authz-exempt: anonymous guest giving has no au.churchId; body churchId is the only source, scoped to the gateway lookup below
      const { id, email, name, churchId, provider } = req.body;
      let { personId, customerId } = req.body;
      const cId = au?.churchId || churchId;
      const canEdit = !!au?.id && au.checkAccess(Permissions.donations.edit);
      if (au?.id && !canEdit) personId = au.personId;
      if (customerId && !canEdit && !(au?.id && await this.ownsCustomer(au, customerId))) customerId = undefined;
      const isGuest = !au?.id;
      if (isGuest && !(await DonationRateLimiter.allow(req, cId))) return this.json({ error: "Too many requests. Please try again later." }, 429);
      if (isGuest && !CaptchaPass.verify(req, cId)) return this.json({ error: "Captcha verification required" }, 403);
      // A guest's personId is client-supplied, so it must never select an existing vault customer.
      const vaultPersonId = isGuest ? undefined : personId;
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
      const saveCustomer = (id: string) => isGuest
        ? this.repos.customer.addGuest({ id, churchId: cId, personId, provider: gateway.provider })
        : this.repos.customer.save({ id, churchId: cId, personId, provider: gateway.provider });

      let customer = await GatewayService.resolveCustomerForAttach(gateway, vaultPersonId, customerId, this.repos);
      if (!customer) {
        try {
          customer = await GatewayService.createCustomer(gateway, email, name, { personId: vaultPersonId });
          if (customer) await saveCustomer(customer);
        } catch (e) {
          return this.json({ error: "Failed to create customer", details: (e as GatewayError).message }, 500);
        }
      }

      try {
        let pm: GatewayObject;
        try {
          pm = await GatewayService.attachPaymentMethod(gateway, id, GatewayService.buildAttachOptions(gateway, customer, id, req.body));
        } catch (attachErr) {
          const status = (attachErr as GatewayError).response?.status || (attachErr as GatewayError).statusCode;
          if (status === 404 && GatewayService.recreatesMissingCustomers(gateway)) {
            console.log(`Customer ${customer} not found on ${gateway.provider}, recreating...`);
            const newCustomer = await GatewayService.createCustomer(gateway, email, name);
            if (newCustomer) {
              await saveCustomer(newCustomer);
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
      } catch (err) {
        const e = err as GatewayError;
        if (isGuest) await DonationRateLimiter.recordDecline(req);
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
  public async updateCard(req: express.Request<{}, {}, UpdateCardRequest>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const { personId, paymentMethodId, cardData, provider } = req.body;
      const gateway = await GatewayService.getGatewayForChurch(
        au.churchId,
        provider ? { provider } : { requiredCapability: "supportsVault" },
        this.repos.gateway
      ).catch((): null => null);
      const permission = gateway && (au.checkAccess(Permissions.donations.edit) || (personId === au.personId && await this.ownsPaymentMethod(au, gateway, paymentMethodId)));
      if (!permission) return this.json({ error: "Insufficient permissions" }, 401);
      try {
        return await GatewayService.updateCard(gateway, paymentMethodId, cardData);
      } catch (err) {
        const e = err as GatewayError;
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
  public async createACHSetupIntent(req: express.Request<{}, {}, AchSetupIntentRequest>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      // authz-exempt: gated to au.personId or donations.edit below; cId prefers au.churchId, body churchId only a fallback
      const { personId, customerId, email, name, churchId } = req.body;
      const cId = au?.churchId || churchId;
      const gateway = await GatewayService.getGatewayForChurch(cId, { requiredCapability: "supportsACH" }, this.repos.gateway).catch((): null => null);

      if (!gateway) {
        return this.json({ error: "Payment gateway not configured" }, 400);
      }

      const canEdit = au.checkAccess(Permissions.donations.edit);
      const permission = canEdit || (personId === au.personId && (!customerId || await this.ownsCustomer(au, customerId)));
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
          } catch (e) {
            console.error("Error creating customer:", e);
            return this.json({ error: "Failed to create customer", details: (e as GatewayError).message }, 500);
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
      } catch (err) {
        const e = err as GatewayError;
        console.error("Error creating ACH SetupIntent:", e);
        return this.json({
          error: e.message || "Failed to create ACH SetupIntent",
          code: e.code || "unknown_error"
        }, e.statusCode || 500);
      }
    });
  }

  @httpPost("/ach-setup-intent-anon")
  public async createACHSetupIntentAnon(req: express.Request<{}, {}, AchSetupIntentRequest>, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => {
      // authz-exempt: public guest-donation flow; churchId required to resolve the public widget gateway
      const { email, name, churchId, gatewayId } = req.body;

      if (!churchId) {
        return this.json({ error: "Church ID is required" }, 400);
      }

      if (!email || !name) {
        return this.json({ error: "Email and name are required" }, 400);
      }

      if (!(await DonationRateLimiter.allow(req, churchId))) return this.json({ error: "Too many requests. Please try again later." }, 429);
      if (!CaptchaPass.verify(req, churchId)) return this.json({ error: "Captcha verification required" }, 403);

      const gateway = await GatewayService.getGatewayForChurch(churchId, { gatewayId }, this.repos.gateway).catch((): null => null);

      if (!gateway) {
        return this.json({ error: "Payment gateway not configured" }, 400);
      }

      if (!GatewayService.supportsACHSetupIntent(gateway)) {
        return this.json({ error: `${gateway.provider} does not support ACH SetupIntent` }, 400);
      }

      try {
        const gatewayCustomerId = await GatewayService.createCustomer(gateway, email, name);

        const setupIntent = await GatewayService.createACHSetupIntent(gateway, gatewayCustomerId, true);
        return {
          clientSecret: setupIntent.client_secret,
          setupIntentId: setupIntent.id,
          customerId: gatewayCustomerId
        };
      } catch (err) {
        const e = err as GatewayError;
        console.error("Error creating anonymous ACH SetupIntent:", e);
        return this.json({
          error: e.message || "Failed to create ACH SetupIntent",
          code: e.code || "unknown_error"
        }, e.statusCode || 500);
      }
    });
  }

  @httpPost("/addbankaccount")
  public async addBankAccount(req: express.Request<{}, {}, AddBankAccountRequest>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const { id, personId, customerId, email, name } = req.body;
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { requiredCapability: "supportsACH" }, this.repos.gateway).catch((): null => null);
      const permission = gateway && (au.checkAccess(Permissions.donations.edit) || (personId === au.personId && (!customerId || await this.ownsCustomer(au, customerId))));
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
        } catch (e) {
          console.error("Error creating customer:", e);
          return this.json({ error: "Failed to create customer", details: (e as GatewayError).message }, 500);
        }
      }

      try {
        return await GatewayService.createBankAccount(gateway, customer, { source: id });
      } catch (err) {
        const e = err as GatewayError;
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
  public async updateBank(req: express.Request<{}, {}, BankChangeRequest>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const { paymentMethodId, personId, bankData, customerId } = req.body;
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { requiredCapability: "supportsACH" }, this.repos.gateway).catch((): null => null);
      const permission = gateway && (au.checkAccess(Permissions.donations.edit) || (personId === au.personId && await this.ownsPaymentMethod(au, gateway, paymentMethodId, customerId)));
      if (!permission) return this.json({}, 401);
      try {
        return await GatewayService.updateBank(gateway, paymentMethodId, bankData, customerId);
      } catch (e) {
        console.error("Update bank error", e);
        // clients read raw.message for the gateway's user-facing error; never echo the full exception
        return { raw: { message: (e as GatewayError | null)?.raw?.message || "Failed to update bank account" } };
      }
    });
  }

  @httpPost("/verifybank")
  public async verifyBank(req: express.Request<{}, {}, BankChangeRequest>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const { paymentMethodId, customerId, amountData } = req.body;
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { requiredCapability: "supportsACH" }, this.repos.gateway).catch((): null => null);
      const permission = gateway && (au.checkAccess(Permissions.donations.edit) || (!!customerId && await this.ownsPaymentMethod(au, gateway, paymentMethodId, customerId)));
      if (!permission) return this.json({}, 401);
      else {
        try {
          return await GatewayService.verifyBank(gateway, paymentMethodId, amountData, customerId);
        } catch (e) {
          console.error("Verify bank error", e);
          return { raw: { message: (e as GatewayError | null)?.raw?.message || "Failed to verify bank account" } };
        }
      }
    });
  }

  @httpDelete("/:id/:customerid")
  public async deletePaymentMethod(@requestParam("id") id: string, @requestParam("customerid") customerId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const providerParam = (req.query.provider as string | undefined)?.toLowerCase();
      let resolvedProvider = providerParam || GatewayService.inferProviderFromMethodId(id);

      if (!resolvedProvider) {
        const localRecord = await this.repos.gatewayPaymentMethod.loadByExternalIdAcrossGateways(au.churchId, id);
        if (localRecord) {
          const gw = (await this.repos.gateway.loadAll(au.churchId) as Gateway[]).find(g => g.id === localRecord.gatewayId);
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
              const customer = this.repos.customer.convertToModel(au.churchId, customerData);
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

      // If the lookup fails we can't tell, so the delete goes ahead as it always has.
      const inUse = await GatewayService.activeSubscriptionIdsUsingMethod(gateway, id, customerId).catch((e): null => {
        console.warn("[PM Delete] Could not check recurring gifts for payment method:", (e as Error)?.message || e);
        return null;
      });
      if (inUse?.length) {
        return this.json({
          error: "This payment method is used by a recurring gift. Move the gift to another payment method, then delete this one.",
          code: "payment_method_in_use"
        }, 409);
      }

      try {
        await GatewayService.deletePaymentMethod(gateway, id, customerId, this.repos);
        return this.json({});
      } catch (err) {
        const e = err as GatewayError | null;
        return this.json({
          error: e?.message || "Failed to delete payment method",
          code: e?.code || "unknown_error"
        }, e?.statusCode || 500);
      }
    });
  }

  private async ownsCustomer(au: AuthenticatedUser, customerId: string): Promise<boolean> {
    if (!au.personId) return false;
    const customer: Customer | null = await this.repos.customer.load(au.churchId, customerId);
    return customer?.personId === au.personId;
  }

  private async ownsPaymentMethod(au: AuthenticatedUser, gateway: Gateway, paymentMethodId: string, customerId?: string): Promise<boolean> {
    if (!au.personId || !paymentMethodId) return false;
    try {
      let customer: Customer | null;
      if (customerId) customer = await this.repos.customer.load(au.churchId, customerId);
      else customer = (await this.repos.customer.loadByPersonAndProvider(au.churchId, au.personId, gateway.provider)) || (await this.repos.customer.loadByPersonId(au.churchId, au.personId));
      if (!customer || customer.personId !== au.personId) return false;
      return await GatewayService.verifyMethodOwnership(gateway, paymentMethodId, customer.id, this.repos);
    } catch (e) {
      console.error("Payment method ownership check failed:", e);
      return false;
    }
  }

}
