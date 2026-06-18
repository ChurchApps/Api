import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { GatewayService } from "../../../shared/helpers/GatewayService.js";
import { GatewayFactory } from "../../../shared/helpers/gateways/GatewayFactory.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { GatewayPaymentMethod } from "../models/index.js";

@controller("/giving/paymentmethods")
export class PaymentMethodController extends GivingBaseController {

  @httpGet("/test/personid/:id")
  public async testGetPersonPaymentMethods(@requestParam("id") id: string, _req: express.Request<{}, {}, null>, _res: express.Response): Promise<any> {
    // Test endpoint without auth for debugging - initialize repos manually
    const { RepoManager } = await import("../../../shared/infrastructure/RepoManager.js");
    this.repos = await RepoManager.getRepos("giving");

    const churchId = "AOjIt0W-SeY"; // hardcoded for testing

    const gateway = await GatewayService.getGatewayForChurch(churchId, {}, this.repos.gateway).catch(() => null);

    if (!gateway) {
      console.log("No gateway found for church");
      return [];
    }

    // Check if provider supports vault/stored payment methods
    const capabilities = GatewayService.getProviderCapabilities(gateway);
    if (!capabilities?.supportsVault) {
      console.log("Provider doesn't support vault");
      return []; // Return empty array for providers without vault support
    }

    let customer = await this.repos.customer.loadByPersonAndProvider(churchId, id, gateway.provider);
    if (!customer) {
      customer = await this.repos.customer.loadByPersonId(churchId, id);
    }


    if (!customer) return [];
    const rawPaymentMethods = await GatewayService.getCustomerPaymentMethods(gateway, customer);


    // Normalize payment methods to consistent format
    const normalizedMethods: any[] = [];

    console.log("Gateway provider:", gateway.provider, "->", gateway.provider?.toLowerCase());

    if (gateway.provider?.toLowerCase() === "stripe" && Array.isArray(rawPaymentMethods)) {
      console.log("Processing Stripe payment methods");
      for (const customerData of rawPaymentMethods) {
        console.log("Processing customerData, has cards.data:", !!customerData.cards?.data);
        // Handle Stripe payment methods (cards)
        if (customerData.cards?.data) {
          for (const pm of customerData.cards.data) {
            // Stripe PaymentMethod object structure
            normalizedMethods.push({
              id: pm.id,
              type: "card",
              provider: "stripe",
              name: pm.card?.brand || "Card",
              last4: pm.card?.last4,
              customerId: pm.customer || customerData.customer?.id,
              status: "active"
            });
          }
        }

        // Handle Stripe bank accounts (PaymentMethod API - us_bank_account)
        if (customerData.banks?.data) {
          for (const bank of customerData.banks.data) {
            // Stripe PaymentMethod (us_bank_account) object structure
            normalizedMethods.push({
              id: bank.id,
              type: "bank",
              provider: "stripe",
              name: bank.us_bank_account?.bank_name || "Bank Account",
              last4: bank.us_bank_account?.last4,
              customerId: bank.customer || customerData.customer?.id,
              status: "active"
            });
          }
        }

        // Handle legacy Stripe bank accounts (Sources API - deprecated)
        if (customerData.legacyBanks?.data) {
          for (const bank of customerData.legacyBanks.data) {
            // Legacy Stripe Source (bank_account) object structure
            normalizedMethods.push({
              id: bank.id,
              type: "bank",
              provider: "stripe",
              name: "Bank Account",
              last4: bank.last4,
              customerId: bank.customer || customerData.customer?.id,
              status: bank.status || "new",
              isLegacy: true  // Flag to identify legacy sources
            });
          }
        }
      }
    }

    console.log("Normalized methods:", normalizedMethods);
    return normalizedMethods;
  }

  @httpGet("/personid/:id")
  public async getPersonPaymentMethods(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.view) && id !== au.personId) return this.json({}, 401);

      // Load ALL gateways for this church
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
          const rawPaymentMethods = await GatewayService.getCustomerPaymentMethods(gateway, customer);

          if (gateway.provider?.toLowerCase() === "stripe" && Array.isArray(rawPaymentMethods)) {
            for (const customerData of rawPaymentMethods) {
              if (customerData.cards?.data) {
                for (const pm of customerData.cards.data) {
                  normalizedMethods.push({
                    id: pm.id,
                    type: "card",
                    provider: "stripe",
                    name: pm.card?.brand || "Card",
                    last4: pm.card?.last4,
                    customerId: pm.customer || customerData.customer?.id,
                    gatewayId: gateway.id,
                    status: "active"
                  });
                }
              }
              if (customerData.banks?.data) {
                for (const bank of customerData.banks.data) {
                  normalizedMethods.push({
                    id: bank.id,
                    type: "bank",
                    provider: "stripe",
                    name: bank.us_bank_account?.bank_name || "Bank Account",
                    last4: bank.us_bank_account?.last4,
                    customerId: bank.customer || customerData.customer?.id,
                    gatewayId: gateway.id,
                    status: "active"
                  });
                }
              }
              if (customerData.legacyBanks?.data) {
                for (const bank of customerData.legacyBanks.data) {
                  normalizedMethods.push({
                    id: bank.id,
                    type: "bank",
                    provider: "stripe",
                    name: "Bank Account",
                    last4: bank.last4,
                    customerId: bank.customer || customerData.customer?.id,
                    gatewayId: gateway.id,
                    status: bank.status || "new",
                    isLegacy: true
                  });
                }
              }
            }
          } else if (gateway.provider?.toLowerCase() === "paypal" && Array.isArray(rawPaymentMethods)) {
            const stored = await this.repos.gatewayPaymentMethod.loadByCustomer(au.churchId, gateway.id, customer.id!);
            const lookup = new Map(stored.map((record) => [record.externalId, record]));
            for (const method of rawPaymentMethods) {
              const record = lookup.get(method?.id);
              normalizedMethods.push({
                id: method.id,
                type: "paypal",
                provider: "paypal",
                name: record?.displayName || "PayPal",
                email: method.email,
                customerId: record?.customerId || customer.id,
                gatewayId: gateway.id
              });
            }
          } else if (gateway.provider?.toLowerCase() === "kingdomfunding" && Array.isArray(rawPaymentMethods)) {
            // Soft-delete model: a payment method only appears if it has a local
            // gatewayPaymentMethods record. Users can "delete" without revoking the
            // card at the gateway (which would break any other system using it).
            const localRecords = await this.repos.gatewayPaymentMethod.loadByCustomer(au.churchId, gateway.id, customer.id!);
            const localExternalIds = new Set(localRecords.map((r: any) => String(r.externalId)));
            for (const pm of rawPaymentMethods) {
              const pmId = String(pm.id);
              if (!localExternalIds.has(pmId)) continue; // soft-deleted by user
              const cardType = pm.card_type || pm.type || "Card";
              const last4 = pm.last_4 || pm.last4 || "";
              normalizedMethods.push({
                id: pmId,
                type: pm.type === "check" ? "bank" : "card",
                provider: "kingdomfunding",
                name: cardType,
                last4,
                customerId: customer.id,
                gatewayId: gateway.id,
                status: "active"
              });
            }
          }
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
      const { id, personId, customerId, email, name, churchId, provider } = req.body;
      const cId = au?.churchId || churchId;
      // Default to Stripe for card operations, but allow frontend to specify provider
      const gateway = await GatewayService.getGatewayForChurch(cId, { provider: provider || "stripe" }, this.repos.gateway).catch(() => null);

      if (!gateway) {
        return this.json({ error: "Payment gateway not configured" }, 400);
      }

      // Check if provider supports vault/stored payment methods
      const capabilities = GatewayService.getProviderCapabilities(gateway);
      if (!capabilities?.supportsVault) {
        return this.json({ error: `${gateway.provider} does not support stored payment methods` }, 400);
      }

      // Validate payment method ID format for Stripe
      if (gateway.provider === "stripe" && (!id || !id.startsWith("pm_"))) {
        return this.json({ error: "Invalid payment method ID format" }, 400);
      }

      // For non-Stripe providers, look up the provider-specific customer instead of using the passed-in (Stripe) customer ID
      let customer = customerId;
      if (gateway.provider?.toLowerCase() !== "stripe" && personId) {
        const providerCustomer = await this.repos.customer.loadByPersonAndProvider(cId, personId, gateway.provider) as any;
        customer = providerCustomer?.id || undefined;
      }
      if (!customer) {
        try {
          customer = await GatewayService.createCustomer(gateway, email, name);
          if (customer) {
            await this.repos.customer.save({ id: customer, churchId: cId, personId, provider: gateway.provider });
          }
        } catch (e: any) {
          return this.json({ error: "Failed to create customer", details: e.message }, 500);
        }
      }

      try {
        const buildAttachOptions = (custId: string) => {
          const opts: any = { customer: custId };
          if (gateway.provider?.toLowerCase() === "kingdomfunding") {
            opts.customerId = custId; // Accept Blue reads customerId; Stripe 400s on the extra key
            // Detect ACH vs card based on which fields the frontend sent
            if (req.body.routing_number && req.body.account_number) {
              opts.routing_number = req.body.routing_number;
              opts.account_number = req.body.account_number;
              opts.account_type = req.body.account_type || "checking";
              opts.name = req.body.name;
            } else {
              opts.source = id;
              if (req.body.expiry_month) opts.expiry_month = req.body.expiry_month;
              if (req.body.expiry_year) opts.expiry_year = req.body.expiry_year;
              if (req.body.cardBrand) opts.cardBrand = req.body.cardBrand;
              if (req.body.cardLast4) opts.cardLast4 = req.body.cardLast4;
            }
          }
          return opts;
        };

        let pm: any;
        try {
          pm = await GatewayService.attachPaymentMethod(gateway, id, buildAttachOptions(customer));
        } catch (attachErr: any) {
          // If customer doesn't exist on the provider (404/Not Found), recreate and retry
          const status = attachErr.response?.status || attachErr.statusCode;
          if (status === 404 && gateway.provider?.toLowerCase() !== "stripe") {
            console.log(`Customer ${customer} not found on ${gateway.provider}, recreating...`);
            const newCustomer = await GatewayService.createCustomer(gateway, email, name);
            if (newCustomer) {
              await this.repos.customer.save({ id: newCustomer, churchId: cId, personId, provider: gateway.provider });
              customer = newCustomer;
              pm = await GatewayService.attachPaymentMethod(gateway, id, buildAttachOptions(customer));
            } else {
              throw attachErr;
            }
          } else {
            throw attachErr;
          }
        }

        // Save to gatewayPaymentMethods for non-Stripe providers
        if ((gateway.provider?.toLowerCase() === "paypal" || gateway.provider?.toLowerCase() === "kingdomfunding") && customer) {
          const tokenId = pm?.id ? String(pm.id) : id;
          if (tokenId) {
            let methodType = "token";
            let displayName = "";

            if (gateway.provider?.toLowerCase() === "paypal") {
              const paymentSource = pm?.payment_source || {};
              const card = paymentSource.card as { last4?: string; brand?: string } | undefined;
              const paypalSource = paymentSource.paypal as { email_address?: string } | undefined;
              methodType = card ? "card" : paypalSource ? "paypal" : typeof pm?.type === "string" ? pm.type : "token";
              displayName = card
                ? `${(card.brand || "Card").toUpperCase()} •••• ${card.last4 ?? ""}`.trim()
                : paypalSource?.email_address || `PayPal token ${tokenId.substring(0, 6)}...`;
            } else {
              // KingdomFunding — detect card vs bank/check
              const isBank = pm?.type === "check"
                || pm?.account_type
                || !!pm?.routing_number
                || !!req.body.routing_number;

              if (isBank) {
                methodType = "bank";
                const acctType = pm?.account_type || req.body.account_type || "checking";
                const last4 = pm?.last4
                  || (pm?.account_number ? String(pm.account_number).slice(-4) : "")
                  || (req.body.account_number ? String(req.body.account_number).slice(-4) : "");
                const acctLabel = acctType.charAt(0).toUpperCase() + acctType.slice(1);
                displayName = `Bank ${acctLabel} •••• ${last4}`.trim();
              } else {
                methodType = "card";
                const cardType = pm?.card_type || req.body.cardBrand || "Card";
                const last4 = pm?.last_4 || req.body.cardLast4 || "";
                displayName = `${cardType} •••• ${last4}`.trim();
              }
            }

            const existing = await this.repos.gatewayPaymentMethod.loadByExternalId(cId, gateway.id, tokenId);
            const isBankRecord = methodType === "bank";
            const recordLast4 = isBankRecord
              ? (pm?.last4 || (pm?.account_number ? String(pm.account_number).slice(-4) : "") || (req.body.account_number ? String(req.body.account_number).slice(-4) : ""))
              : (pm?.last_4 || req.body.cardLast4 || "");
            const record: GatewayPaymentMethod = {
              id: existing?.id,
              churchId: cId,
              gatewayId: gateway.id,
              customerId: customer,
              externalId: tokenId,
              methodType,
              displayName,
              metadata: {
                status: pm?.status,
                brand: isBankRecord
                  ? (pm?.account_type || req.body.account_type || "Bank")
                  : (pm?.card_type || req.body.cardBrand),
                last4: recordLast4
              }
            };
            await this.repos.gatewayPaymentMethod.save(record);
          }
        }

        return { paymentMethod: pm, customerId: customer };
      } catch (e: any) {
        // Handle specific gateway errors
        if (e.type === "StripeInvalidRequestError") {
          if (e.code === "resource_missing") {
            return this.json({
              error: "Payment method not found. Please create a new payment method.",
              code: "payment_method_not_found"
            }, 404);
          } else if (e.code === "parameter_invalid_empty") {
            return this.json({
              error: "Invalid payment method parameters",
              code: "invalid_parameters"
            }, 400);
          }
        }

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
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: provider || "stripe" }, this.repos.gateway).catch(() => null);
      const permission = gateway && (au.checkAccess(Permissions.donations.edit) || personId === au.personId);
      if (!permission) return this.json({ error: "Insufficient permissions" }, 401);
      try {
        return await GatewayService.updateCard(gateway, paymentMethodId, cardData);
      } catch (e: any) {
        console.error("Error updating card:", e);
        if (e.type === "StripeInvalidRequestError" && e.code === "resource_missing") {
          return this.json({
            error: "Payment method not found",
            code: "payment_method_not_found"
          }, 404);
        }
        return this.json({
          error: e.message || "Failed to update card",
          code: e.code || "unknown_error"
        }, e.statusCode || 500);
      }
    });
  }

  // New endpoint for ACH bank account setup using Financial Connections
  @httpPost("/ach-setup-intent")
  public async createACHSetupIntent(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { personId, customerId, email, name, churchId } = req.body;
      const cId = au?.churchId || churchId;
      // ACH SetupIntent is Stripe-only
      const gateway = await GatewayService.getGatewayForChurch(cId, { provider: "stripe" }, this.repos.gateway).catch(() => null);

      if (!gateway) {
        return this.json({ error: "Payment gateway not configured" }, 400);
      }

      const permission = au.checkAccess(Permissions.donations.edit) || personId === au.personId;
      if (!permission) return this.json({ error: "Insufficient permissions" }, 401);

      // Check if provider supports ACH/bank accounts
      const capabilities = GatewayService.getProviderCapabilities(gateway);
      if (!capabilities?.supportsACH) {
        return this.json({ error: `${gateway.provider} does not support bank account payments` }, 400);
      }

      // Only Stripe supports this flow
      if (gateway.provider?.toLowerCase() !== "stripe") {
        return this.json({ error: "ACH SetupIntent only supported for Stripe" }, 400);
      }

      let customer = customerId;
      if (!customer) {
        // First, check if a customer already exists in the database for this person
        const existingCustomer = await this.repos.customer.loadByPersonAndProvider(cId, personId, gateway.provider)
          || await this.repos.customer.loadByPersonId(cId, personId);

        if (existingCustomer?.id) {
          customer = existingCustomer.id;
        } else {
          // No existing customer, create a new one
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

  // Anonymous endpoint for ACH bank account setup (for guest donations)
  @httpPost("/ach-setup-intent-anon")
  public async createACHSetupIntentAnon(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const { email, name, churchId, gatewayId } = req.body;

      if (!churchId) {
        return this.json({ error: "Church ID is required" }, 400);
      }

      if (!email || !name) {
        return this.json({ error: "Email and name are required" }, 400);
      }

      const gateway = await GatewayService.getGatewayForChurch(churchId, { gatewayId }, this.repos.gateway).catch(() => null);

      if (!gateway) {
        return this.json({ error: "Payment gateway not configured" }, 400);
      }

      // Check if provider supports ACH/bank accounts
      const capabilities = GatewayService.getProviderCapabilities(gateway);
      if (!capabilities?.supportsACH) {
        return this.json({ error: `${gateway.provider} does not support bank account payments` }, 400);
      }

      // Only Stripe supports this flow
      if (gateway.provider?.toLowerCase() !== "stripe") {
        return this.json({ error: "ACH SetupIntent only supported for Stripe" }, 400);
      }

      try {
        // Create a temporary Stripe customer (not saved to DB for guest one-time donation)
        const stripeCustomerId = await GatewayService.createCustomer(gateway, email, name);

        // Create ACH SetupIntent
        const setupIntent = await GatewayService.createACHSetupIntent(gateway, stripeCustomerId);
        return {
          clientSecret: setupIntent.client_secret,
          setupIntentId: setupIntent.id,
          customerId: stripeCustomerId
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

  // Legacy endpoint for adding bank accounts via token (deprecated - use ach-setup-intent instead)
  @httpPost("/addbankaccount")
  public async addBankAccount(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { id, personId, customerId, email, name } = req.body;
      // Bank accounts are Stripe-only
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: "stripe" }, this.repos.gateway).catch(() => null);
      const permission = gateway && (au.checkAccess(Permissions.donations.edit) || personId === au.personId);
      if (!permission) return this.json({ error: "Insufficient permissions" }, 401);

      // Check if provider supports ACH/bank accounts
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
      // Bank operations are Stripe-only
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: "stripe" }, this.repos.gateway).catch(() => null);
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
      // Bank verification is Stripe-only
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: "stripe" }, this.repos.gateway).catch(() => null);
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

  /**
   * Confirm a payment method belongs to the given customer before a non-admin can delete it.
   * Non-Stripe PMs are tracked in gatewayPaymentMethods (the source of truth); Stripe PMs are
   * verified against the customer's live payment methods at the gateway.
   */
  private async verifyPaymentMethodOwnership(churchId: string, gateway: any, paymentMethodId: string, customerId: string): Promise<boolean> {
    const prov = gateway.provider?.toLowerCase();
    if (prov === "paypal" || prov === "kingdomfunding") {
      const record = await this.repos.gatewayPaymentMethod.loadByExternalId(churchId, gateway.id, paymentMethodId)
        || await this.repos.gatewayPaymentMethod.loadByExternalIdAcrossGateways(churchId, paymentMethodId);
      return !!record && String(record.customerId) === String(customerId);
    }
    try {
      const customerData = await this.repos.customer.load(churchId, customerId);
      const customer = customerData ? this.repos.customer.convertToModel(churchId, customerData as any) : null;
      if (!customer) return false;
      const pmList = await GatewayService.getCustomerPaymentMethods(gateway, customer);
      const ids = new Set<string>();
      for (const cd of (Array.isArray(pmList) ? pmList : [])) {
        for (const coll of [cd?.cards?.data, cd?.banks?.data, cd?.legacyBanks?.data]) {
          for (const pm of (coll || [])) ids.add(String(pm.id));
        }
      }
      return ids.has(String(paymentMethodId));
    } catch (e) {
      console.error("[PM Delete] Stripe ownership verification failed:", e);
      return false;
    }
  }

  @httpDelete("/:id/:customerid")
  public async deletePaymentMethod(@requestParam("id") id: string, @requestParam("customerid") customerId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      // Determine provider: pm_ and ba_ are Stripe, otherwise check query param or look up in gatewayPaymentMethods
      const providerParam = (req.query as any).provider?.toLowerCase();
      const isStripe = id.startsWith("pm_") || id.startsWith("ba_");
      let resolvedProvider = providerParam || (isStripe ? "stripe" : null);

      // If provider not determined, look up in gatewayPaymentMethods table
      if (!resolvedProvider) {
        const localRecord = await this.repos.gatewayPaymentMethod.loadByExternalIdAcrossGateways(au.churchId, id);
        if (localRecord) {
          const gw = (await this.repos.gateway.loadAll(au.churchId) as any[]).find(g => g.id === localRecord.gatewayId);
          resolvedProvider = gw?.provider?.toLowerCase() || "paypal";
        } else if (/^\d+$/.test(id)) {
          // Numeric IDs are Accept Blue / KingdomFunding payment method IDs
          resolvedProvider = "kingdomfunding";
        } else {
          resolvedProvider = "paypal"; // fallback for backward compat
        }
      }

      const gateway = await GatewayService.getGatewayForChurch(au.churchId, { provider: resolvedProvider }, this.repos.gateway).catch(() => null);

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
                permission = await this.verifyPaymentMethodOwnership(au.churchId, gateway, id, customerId);
              }
            }
          } catch (permErr) {
            console.error("[PM Delete] Permission check error:", permErr);
          }
        }
      }
      if (!permission) return this.json({}, 401);

      try {
        try {
          if (id.startsWith("ba_")) {
            await GatewayService.deleteBankAccount(gateway, customerId, id);
          } else {
            await GatewayService.detachPaymentMethod(gateway, id);
          }
        } catch (detachErr: any) {
          const msg = detachErr?.message || "";
          if (resolvedProvider === "kingdomfunding" && msg.includes("active recurring")) {
            // Try to cancel linked subscriptions, then retry
            try {
              const provider = GatewayFactory.getProvider(gateway.provider);
              const config = GatewayService.getGatewayConfig(gateway);
              const schedules = await (provider as any).getCustomerSubscriptions(config, customerId);
              const activeSchedules = (schedules || []).filter((s: any) => s.payment_method_id?.toString() === id && s.active !== false);
              for (const schedule of activeSchedules) {
                try {
                  await provider.cancelSubscription(config, schedule.id.toString());
                  await this.repos.subscription.delete(au.churchId, schedule.id.toString()).catch(() => {});
                } catch (cancelErr: any) {
                  console.error("[PM Delete] Failed to cancel schedule", schedule.id, cancelErr.message);
                }
              }
              await GatewayService.detachPaymentMethod(gateway, id);
            } catch (retryErr: any) {
              // Could not delete from Accept Blue — proceed to clean up locally only
              console.warn("[PM Delete] Could not delete PM from provider, cleaning up local records only:", retryErr?.message || retryErr);
            }
          } else {
            throw detachErr;
          }
        }

        // Always clean up local records for non-Stripe providers
        const prov = gateway.provider?.toLowerCase();
        if (prov === "paypal" || prov === "kingdomfunding") {
          await this.repos.gatewayPaymentMethod.deleteByExternalId(au.churchId, gateway.id, id);
        }

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
