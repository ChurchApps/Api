import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController";
import { StripeHelper } from "../../../shared/helpers/StripeHelper";
import { EncryptionHelper } from "@churchapps/apihelper";
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
      const secretKey = await this.loadPrivateKey(au.churchId);
      const permission = secretKey && (au.checkAccess(Permissions.donations.view) || id === au.personId);
      if (!permission) return this.json({}, 401);
      else {
        const customer = await this.repos.customer.loadByPersonId(au.churchId, id);
        return customer ? await StripeHelper.getCustomerPaymentMethods(secretKey, customer) : [];
      }
    });
  }

  @httpPost("/addcard")
  public async addCard(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { id, personId, customerId, email, name, churchId } = req.body;
      const cId = au?.churchId || churchId;
      const secretKey = await this.loadPrivateKey(cId);

      // Require permission to edit cards, but not add so we can accept logged out donations
      // const permission = secretKey && (au.checkAccess(Permissions.donations.edit) || personId === au.personId);

      if (!secretKey) {
        return this.json({ error: "Payment gateway not configured" }, 400);
      }

      // Validate payment method ID format
      if (!id || !id.startsWith("pm_")) {
        return this.json({ error: "Invalid payment method ID format" }, 400);
      }

      let customer = customerId;
      if (!customer) {
        try {
          customer = await StripeHelper.createCustomer(secretKey, email, name);
          await this.repos.customer.save({ id: customer, churchId: cId, personId });
        } catch (e: any) {
          return this.json({ error: "Failed to create customer", details: e.message }, 500);
        }
      }

      try {
        const pm = await StripeHelper.attachPaymentMethod(secretKey, id, { customer });
        return { paymentMethod: pm, customerId: customer };
      } catch (e: any) {
        // Handle specific Stripe errors
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
      const secretKey = await this.loadPrivateKey(au.churchId);
      const permission = secretKey && (au.checkAccess(Permissions.donations.edit) || personId === au.personId);
      if (!permission) return this.json({ error: "Insufficient permissions" }, 401);

      try {
        return await StripeHelper.updateCard(secretKey, paymentMethodId, cardData);
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
      const secretKey = await this.loadPrivateKey(au.churchId);
      const permission = secretKey && (au.checkAccess(Permissions.donations.edit) || personId === au.personId);
      if (!permission) return this.json({ error: "Insufficient permissions" }, 401);

      let customer = customerId;
      if (!customer) {
        try {
          customer = await StripeHelper.createCustomer(secretKey, email, name);
          await this.repos.customer.save({ id: customer, churchId: au.churchId, personId });
        } catch (e: any) {
          console.error("Error creating customer:", e);
          return this.json({ error: "Failed to create customer", details: e.message }, 500);
        }
      }

      try {
        return await StripeHelper.createBankAccount(secretKey, customer, { source: id });
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
      const secretKey = await this.loadPrivateKey(au.churchId);
      const { paymentMethodId, personId, bankData, customerId } = req.body;
      const permission = secretKey && (au.checkAccess(Permissions.donations.edit) || personId === au.personId);
      if (!permission) return this.json({}, 401);
      try {
        return await StripeHelper.updateBank(secretKey, paymentMethodId, bankData, customerId);
      } catch (e) {
        return e;
      }
    });
  }

  @httpPost("/verifybank")
  public async verifyBank(req: express.Request<any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const secretKey = await this.loadPrivateKey(au.churchId);
      const { paymentMethodId, customerId, amountData } = req.body;
      const permission =
        secretKey &&
        (au.checkAccess(Permissions.donations.edit) || (await this.repos.customer.convertToModel(au.churchId, await this.repos.customer.load(au.churchId, customerId)).personId) === au.personId);
      if (!permission) return this.json({}, 401);
      else {
        try {
          return await StripeHelper.verifyBank(secretKey, paymentMethodId, amountData, customerId);
        } catch (e) {
          return e;
        }
      }
    });
  }

  @httpDelete("/:id/:customerid")
  public async deletePaymentMethod(@requestParam("id") id: string, @requestParam("customerid") customerId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const secretKey = await this.loadPrivateKey(au.churchId);
      const permission =
        secretKey &&
        (au.checkAccess(Permissions.donations.edit) || (await this.repos.customer.convertToModel(au.churchId, await this.repos.customer.load(au.churchId, customerId)).personId) === au.personId);
      if (!permission) return this.json({}, 401);
      else {
        const paymentType = id.substring(0, 2);
        if (paymentType === "pm") await StripeHelper.detachPaymentMethod(secretKey, id);
        if (paymentType === "ba") await StripeHelper.deleteBankAccount(secretKey, customerId, id);
        return this.json({});
      }
    });
  }

  private loadPrivateKey = async (churchId: string) => {
    const gateways = await this.repos.gateway.loadAll(churchId);
    return (gateways as any[]).length === 0 ? "" : EncryptionHelper.decrypt((gateways as any[])[0].privateKey);
  };
}
