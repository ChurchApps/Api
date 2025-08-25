import { controller, httpPost, httpGet, interfaces, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController";
import { Fund } from "../models";
import { Permissions } from "../../../shared/helpers/Permissions";

@controller("/giving/funds")
export class FundController extends GivingBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json(null, 401);
      else {
        return this.repositories.fund.convertToModel(au.churchId, await this.repositories.fund.load(au.churchId, id));
      }
    });
  }

  @httpGet("/churchId/:churchId")
  public async getForChurch(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return this.repositories.fund.convertAllToModel(churchId, (await this.repositories.fund.loadAll(churchId)) as any[]);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return this.repositories.fund.convertAllToModel(au.churchId, (await this.repositories.fund.loadAll(au.churchId)) as any[]);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Fund[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json([], 401);
      else {
        const promises: Promise<Fund>[] = [];
        req.body.forEach((fund) => {
          fund.churchId = au.churchId;
          promises.push(this.repositories.fund.save(fund));
        });
        const result = await Promise.all(promises);
        return this.repositories.fund.convertAllToModel(au.churchId, result as any[]);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json([], 401);
      else {
        await this.repositories.fund.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
