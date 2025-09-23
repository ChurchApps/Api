import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController";
import { GatewayService } from "../../../shared/helpers/GatewayService";
import { Permissions } from "../../../shared/helpers/Permissions";
import { GatewayPaymentMethod } from "../models";

@controller("/giving/paymentmethods")
export class PaymentMethodController extends GivingCrudController {
  protected crudSettings = {
    repoKey: "customer", // not used by base here
    permissions: { view: Permissions.donations.view, edit: Permissions.donations.edit },
    routes: [] as const
  };

  @httpGet("/test/personid/:id")
  public async testGetPersonPaymentMethods(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    // Test endpoint without auth for debugging - initialize repos manually
    const RepoManager = require("../../../shared/infrastructure/RepoManager").RepoManager;
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

    console.log("Customer lookup result:", customer);

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

        // Handle Stripe bank accounts (sources)
        if (customerData.banks?.data) {
          for (const bank of customerData.banks.data) {
            // Stripe Source (bank_account) object structure
            normalizedMethods.push({
              id: bank.id,
              type: "bank",
              provider: "stripe",
              name: "Bank Account",
              last4: bank.last4,
              customerId: bank.customer || customerData.customer?.id,
              status: bank.status || "new"
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
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, {}, this.repos.gateway).catch(() => null);
      const permission = gateway && (au.checkAccess(Permissions.donations.view) || id === au.personId);
      if (!permission) return this.json({}, 401);

      // Check if provider supports vault/stored payment methods
      const capabilities = GatewayService.getProviderCapabilities(gateway);
      if (!capabilities?.supportsVault) {
        return []; // Return empty array for providers without vault support
      }

      let customer = await this.repos.customer.loadByPersonAndProvider(au.churchId, id, gateway.provider);
      if (!customer) {
        customer = await this.repos.customer.loadByPersonId(au.churchId, id);
      }

      console.log("Customer lookup result:", customer);

      if (!customer) return [];
      const rawPaymentMethods = await GatewayService.getCustomerPaymentMethods(gateway, customer);

      // Debug logging
      //console.log("Raw payment methods from gateway:", JSON.stringify(rawPaymentMethods, null, 2));

      // Normalize payment methods to consistent format
      const normalizedMethods: any[] = [];

      if (gateway.provider?.toLowerCase() === "stripe" && Array.isArray(rawPaymentMethods)) {
        for (const customerData of rawPaymentMethods) {
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

          // Handle Stripe bank accounts (sources)
          if (customerData.banks?.data) {
            for (const bank of customerData.banks.data) {
              // Stripe Source (bank_account) object structure
              normalizedMethods.push({
                id: bank.id,
                type: "bank",
                provider: "stripe",
                name: "Bank Account",
                last4: bank.last4,
                customerId: bank.customer || customerData.customer?.id,
                status: bank.status || "new"
              });
            }
          }
        }
      } else if (gateway.provider?.toLowerCase() === "paypal" && Array.isArray(rawPaymentMethods)) {
        const stored = await this.repos.gatewayPaymentMethod.loadByCustomer(au.churchId, gateway.id, customer.id!);
        if (stored.length) {
          const lookup = new Map(stored.map((record) => [record.externalId, record]));
          for (const method of rawPaymentMethods) {
            const record = lookup.get(method?.id);
            const normalizedMethod = {
              id: method.id,
              type: "paypal",
              provider: "paypal",
              name: record?.displayName || "PayPal",
              email: method.email,
              customerId: record?.customerId || customer.id
            };
            normalizedMethods.push(record ? { ...normalizedMethod, localRecord: record } : normalizedMethod);
          }
        } else {
          // No stored records, just normalize what we have
          for (const method of rawPaymentMethods) {
            normalizedMethods.push({
              id: method.id,
              type: "paypal",
              provider: "paypal",
              name: "PayPal",
              email: method.email,
              customerId: customer.id
            });
          }
        }
      }

      return normalizedMethods;
    });
  }

  @httpPost("/addcard")
  public async addCard(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { id, personId, customerId, email, name, churchId } = req.body;
      const cId = au?.churchId || churchId;
      const gateway = await GatewayService.getGatewayForChurch(cId, {}, this.repos.gateway).catch(() => null);

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

      let customer = customerId;
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
        const pm = await GatewayService.attachPaymentMethod(gateway, id, { customer });
        if (gateway.provider === "paypal" && customer) {
          const tokenId = pm?.id || id;
          if (tokenId) {
            const paymentSource = pm?.payment_source || {};
            const card = paymentSource.card as { last4?: string; brand?: string } | undefined;
            const paypalSource = paymentSource.paypal as { email_address?: string } | undefined;

            const methodType = card
              ? "card"
              : paypalSource
              ? "paypal"
              : typeof pm?.type === "string"
              ? pm.type
              : "token";

            const displayName = card
              ? `${(card.brand || "Card").toUpperCase()} •••• ${card.last4 ?? ""}`.trim()
              : paypalSource?.email_address || `PayPal token ${tokenId.substring(0, 6)}...`;

            const existing = await this.repos.gatewayPaymentMethod.loadByExternalId(cId, gateway.id, tokenId);
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
                brand: card?.brand,
                last4: card?.last4
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
      const { personId, paymentMethodId, cardData } = req.body;
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, {}, this.repos.gateway).catch(() => null);
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

  @httpPost("/addbankaccount")
  public async addBankAccount(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { id, personId, customerId, email, name } = req.body;
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, {}, this.repos.gateway).catch(() => null);
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
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, {}, this.repos.gateway).catch(() => null);
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
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, {}, this.repos.gateway).catch(() => null);
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
      const gateway = await GatewayService.getGatewayForChurch(au.churchId, {}, this.repos.gateway).catch(() => null);
      const permission =
        gateway &&
        (au.checkAccess(Permissions.donations.edit) || (await this.repos.customer.convertToModel(au.churchId, await this.repos.customer.load(au.churchId, customerId)).personId) === au.personId);
      if (!permission) return this.json({}, 401);
      else {
        try {
          if (id.startsWith("ba_")) {
            await GatewayService.deleteBankAccount(gateway, customerId, id);
          } else {
            await GatewayService.detachPaymentMethod(gateway, id);
          }

          if (gateway.provider === "paypal") {
            await this.repos.gatewayPaymentMethod.deleteByExternalId(au.churchId, gateway.id, id);
          }

          return this.json({});
        } catch (e: any) {
          return this.json({
            error: e?.message || "Failed to delete payment method",
            code: e?.code || "unknown_error"
          }, e?.statusCode || 500);
        }
      }
    });
  }

}
