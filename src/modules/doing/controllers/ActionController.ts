import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController";
import { Action } from "../models";

@controller("/doing/actions")
export class ActionController extends DoingBaseController {
  @httpGet("/:id")
  public async get(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.action.load(au.churchId, id);
    });
  }

  @httpGet("/automation/:id")
  public async getForAutomation(
    @requestParam("id") automationId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.action.loadForAutomation(au.churchId, automationId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Action[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Action>[] = [];
      req.body.forEach((action) => {
        action.churchId = au.churchId;
        promises.push(this.repositories.action.save(action));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.action.delete(au.churchId, id);
      return {};
    });
  }
}
