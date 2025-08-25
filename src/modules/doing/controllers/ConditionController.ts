import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController";
import { Condition } from "../models";

@controller("/doing/conditions")
export class ConditionController extends DoingBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.condition.load(au.churchId, id);
    });
  }

  @httpGet("/automation/:id")
  public async getForAutomation(@requestParam("id") automationId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.condition.loadForAutomation(au.churchId, automationId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Condition[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Condition>[] = [];
      req.body.forEach((condition) => {
        condition.churchId = au.churchId;
        promises.push(this.repositories.condition.save(condition));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.condition.delete(au.churchId, id);
      return {};
    });
  }
}
