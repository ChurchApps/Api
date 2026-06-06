import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Conjunction } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/conjunctions")
export class ConjunctionController extends DoingBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.conjunction.load(au.churchId, id);
    });
  }

  @httpGet("/automation/:id")
  public async getForAutomation(@requestParam("id") automationId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.conjunction.loadForAutomation(au.churchId, automationId);
    });
  }

  @httpGet("/stepRoute/:id")
  public async getForStepRoute(@requestParam("id") stepRouteId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.conjunction.loadForStepRoute(au.churchId, stepRouteId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Conjunction[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      // A conjunction belongs to exactly one owner: automationId XOR stepRouteId.
      const ownerInvalid = req.body.some((c) => (c.automationId ? 1 : 0) + (c.stepRouteId ? 1 : 0) !== 1);
      if (ownerInvalid) return this.json({ message: "A conjunction must belong to exactly one of automationId or stepRouteId" }, 400);
      const promises: Promise<Conjunction>[] = [];
      req.body.forEach((conjunction) => {
        conjunction.churchId = au.churchId;
        promises.push(this.repos.conjunction.save(conjunction));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      await this.repos.conjunction.delete(au.churchId, id);
      return {};
    });
  }
}
