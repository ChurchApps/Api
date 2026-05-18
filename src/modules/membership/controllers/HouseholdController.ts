import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { Household } from "../models/index.js";
import { WebhookDispatcher } from "../../../shared/webhooks/index.js";

@controller("/membership/households")
export class HouseholdController extends MembershipBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.household.load(au.churchId, id);
      return this.repos.household.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.household.loadAll(au.churchId);
      return this.repos.household.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Household[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      const promises: Promise<Household>[] = [];
      req.body.forEach((item) => {
        item.churchId = au.churchId;
        const isNew = !item.id;
        promises.push(
          this.repos.household.save(item).then(async (saved) => {
            await WebhookDispatcher.emit(this.repos, au.churchId, isNew ? "household.created" : "household.updated", saved);
            return saved;
          })
        );
      });
      const result = await Promise.all(promises);
      return this.repos.household.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      await this.repos.household.delete(au.churchId, id);
      await WebhookDispatcher.emit(this.repos, au.churchId, "household.destroyed", { id, churchId: au.churchId });
      return {};
    });
  }
}
