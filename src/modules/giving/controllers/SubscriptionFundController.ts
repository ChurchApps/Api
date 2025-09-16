import { controller, httpDelete, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController";
import { Permissions } from "../../../shared/helpers/Permissions";

@controller("/giving/subscriptionfunds")
export class SubscriptionFundController extends GivingCrudController {
  protected crudSettings = {
    repoKey: "subscriptionFunds",
    permissions: { view: Permissions.donations.view, edit: Permissions.donations.edit },
    routes: [] as const
  };
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json(null, 401);
      else return this.repos.subscriptionFunds.convertToModel(au.churchId, await this.repos.subscriptionFunds.load(au.churchId, id));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (req.query.subscriptionId !== undefined) {
        const subscriptionId = req.query.subscriptionId.toString();
        const subscriptionData = await this.repos.subscription.load(au.churchId, subscriptionId);
        const permission = au.checkAccess(Permissions.donations.view) || (subscriptionData as any)?.personId === au.personId;
        if (!permission) return this.json([], 401);
        else return await this.repos.subscriptionFunds.loadBySubscriptionId(au.churchId, req.query.subscriptionId.toString());
      }
      if (!au.checkAccess(Permissions.donations.view)) return this.json([], 401);
      else return this.repos.subscriptionFunds.convertAllToModel(au.churchId, (await this.repos.subscriptionFunds.loadAll(au.churchId)) as any[]);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json(null, 401);
      else {
        await this.repos.subscriptionFunds.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  @httpDelete("/subscription/:id")
  public async deleteBySubscriptionId(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const permission = au.checkAccess(Permissions.donations.edit) || ((await this.repos.subscription.load(au.churchId, id)) as any).personId === au.personId;
      if (!permission) return this.json(null, 401);
      else {
        await this.repos.subscriptionFunds.deleteBySubscriptionId(au.churchId, id);
        return this.json({});
      }
    });
  }
}
