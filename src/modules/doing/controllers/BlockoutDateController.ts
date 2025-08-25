import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController";
import { BlockoutDate } from "../models";

@controller("/doing/blockoutDates")
export class BlockoutDateController extends DoingBaseController {
  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = req.query.ids as string;
      const ids = idsString.split(",");
      return await this.repositories.blockoutDate.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/my")
  public async getMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.blockoutDate.loadForPerson(au.churchId, au.personId);
    });
  }

  @httpGet("/upcoming")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.blockoutDate.loadUpcoming(au.churchId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.blockoutDate.load(au.churchId, id);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, BlockoutDate[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<BlockoutDate>[] = [];
      req.body.forEach((blockoutDate) => {
        blockoutDate.churchId = au.churchId;
        if (!blockoutDate.personId) blockoutDate.personId = au.personId;
        promises.push(this.repositories.blockoutDate.save(blockoutDate));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.blockoutDate.delete(au.churchId, id);
      return {};
    });
  }
}
