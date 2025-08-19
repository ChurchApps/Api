import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController";
import { Conjunction } from "../models";

@controller("/doing/conjunctions")
export class ConjunctionController extends DoingBaseController {
  @httpGet("/:id")
  public async get(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repositories = await this.getDoingRepositories();
      return await repositories.conjunction.load(au.churchId, id);
    });
  }

  @httpGet("/automation/:id")
  public async getForAutomation(
    @requestParam("id") automationId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repositories = await this.getDoingRepositories();
      return await repositories.conjunction.loadForAutomation(au.churchId, automationId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Conjunction[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repositories = await this.getDoingRepositories();
      const promises: Promise<Conjunction>[] = [];
      req.body.forEach((conjunction) => {
        conjunction.churchId = au.churchId;
        promises.push(repositories.conjunction.save(conjunction));
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
      const repositories = await this.getDoingRepositories();
      await repositories.conjunction.delete(au.churchId, id);
      return {};
    });
  }
}
