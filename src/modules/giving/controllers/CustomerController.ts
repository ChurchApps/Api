import { controller, httpGet, interfaces, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController";
import { Permissions } from "../../../shared/helpers/Permissions";
import { StripeHelper } from "../../../shared/helpers/StripeHelper";
import { EncryptionHelper } from "@churchapps/apihelper";

@controller("/giving/customers")
export class CustomerController extends GivingBaseController {
  @httpGet("/:id")
  public async get(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const customer = await this.repositories.customer.convertToModel(
        au.churchId,
        (await this.repositories.customer.load(au.churchId, id)) as any
      );
      if (!au.checkAccess(Permissions.donations.viewSummary) && au.personId !== customer.personId)
        return this.json({}, 401);
      else return customer;
    });
  }

  @httpGet("/:id/subscriptions")
  public async getSubscriptions(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const secretKey = await this.loadPrivateKey(au.churchId);
      let permission = false;
      if (secretKey) {
        if (au.checkAccess(Permissions.donations.viewSummary)) {
          permission = true;
        } else {
          const customerData = await this.repositories.customer.load(au.churchId, id);
          if (customerData) {
            const customer = this.repositories.customer.convertToModel(au.churchId, customerData as any);
            permission = customer.personId === au.personId;
          }
        }
      }
      if (!permission) return this.json({}, 401);
      else return await StripeHelper.getCustomerSubscriptions(secretKey, id);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json({}, 401);
      else
        return this.repositories.customer.convertAllToModel(
          au.churchId,
          (await this.repositories.customer.loadAll(au.churchId)) as any[]
        );
    });
  }

  @httpDelete("/:id")
  public async delete(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      else {
        await this.repositories.customer.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  private loadPrivateKey = async (churchId: string) => {
    const gateways = (await this.repositories.gateway.loadAll(churchId)) as any[];
    return (gateways as any[]).length === 0 ? "" : EncryptionHelper.decrypt((gateways as any[])[0].privateKey);
  };
}