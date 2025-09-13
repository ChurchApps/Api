import { controller, httpPost, httpGet } from "inversify-express-utils";
import express from "express";
import { DoingCrudController } from "./DoingCrudController";
import { BlockoutDate } from "../models";

@controller("/doing/blockoutDates")
export class BlockoutDateController extends DoingCrudController {
  protected crudSettings = {
    repoKey: "blockoutDate",
    permissions: { view: null, edit: null },
    routes: ["getById", "delete"] as const
  };
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
}
