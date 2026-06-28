import { controller, httpPost, httpGet, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { BlockoutDate } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/blockoutDates")
export class BlockoutDateController extends DoingBaseController {
  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = req.query.ids as string;
      const ids = idsString.split(",");
      return await this.repos.blockoutDate.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/my")
  public async getMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.blockoutDate.loadForPerson(au.churchId, au.personId);
    });
  }

  @httpGet("/upcoming")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.blockoutDate.loadUpcoming(au.churchId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.blockoutDate.load(au.churchId, id);
      return this.repos.blockoutDate.convertToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, BlockoutDate[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const canEditOthers = au.checkAccess(Permissions.plans.edit);
      const promises: Promise<BlockoutDate>[] = [];
      for (const blockoutDate of req.body) {
        blockoutDate.churchId = au.churchId;
        if (!blockoutDate.personId) blockoutDate.personId = au.personId;
        if (blockoutDate.personId !== au.personId && !canEditOthers) return this.json({}, 401);
        promises.push(this.repos.blockoutDate.save(blockoutDate));
      }
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const blockoutDate = (await this.repos.blockoutDate.load(au.churchId, id)) as BlockoutDate;
      if (!blockoutDate) return {};
      if (blockoutDate.personId !== au.personId && !au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      await this.repos.blockoutDate.delete(au.churchId, id);
      return {};
    });
  }
}
