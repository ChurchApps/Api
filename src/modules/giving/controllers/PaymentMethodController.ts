import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController";
import { GatewayService } from "../../../shared/helpers/GatewayService";
import { Permissions } from "../../../shared/helpers/Permissions";

@controller("/giving/paymentmethods")
export class PaymentMethodController extends GivingCrudController {
  protected crudSettings = {
    repoKey: "customer", // not used by base here
    permissions: { view: Permissions.donations.view, edit: Permissions.donations.edit },
    routes: [] as const
  };

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

      const customer = await this.repos.customer.loadByPersonId(au.churchId, id);
      if (!customer) return [];
      return await GatewayService.getCustomerPaymentMethods(gateway, customer);
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
            await this.repos.customer.save({ id: customer, churchId: cId, personId });
          }
        } catch (e: any) {
          return this.json({ error: "Failed to create customer", details: e.message }, 500);
        }
      }

      try {
        const pm = await GatewayService.attachPaymentMethod(gateway, id, { customer });
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
            await this.repos.customer.save({ id: customer, churchId: au.churchId, personId });
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
        const paymentType = id.substring(0, 2);
        if (paymentType === "pm") await GatewayService.detachPaymentMethod(gateway, id);
        if (paymentType === "ba") await GatewayService.deleteBankAccount(gateway, customerId, id);
        return this.json({});
      }
    });
  }

}
