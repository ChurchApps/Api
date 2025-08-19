import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController";
import { Assignment } from "../models";

@controller("/doing/assignments")
export class AssignmentController extends DoingBaseController {
  @httpGet("/my")
  public async getMy(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repositories = await this.getDoingRepositories();
      return await repositories.assignment.loadByByPersonId(au.churchId, au.personId);
    });
  }

  @httpGet("/:id")
  public async get(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repositories = await this.getDoingRepositories();
      return await repositories.assignment.load(au.churchId, id);
    });
  }

  @httpGet("/plan/ids")
  public async getByPlanIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repositories = await this.getDoingRepositories();
      const planIdsString = req.query.planIds as string;
      const planIds = planIdsString.split(",");
      return await repositories.assignment.loadByPlanIds(au.churchId, planIds);
    });
  }

  @httpGet("/plan/:planId")
  public async getForPlan(
    @requestParam("planId") planId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repositories = await this.getDoingRepositories();
      return await repositories.assignment.loadByPlanId(au.churchId, planId);
    });
  }

  @httpPost("/accept/:id")
  public async accept(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, []>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repositories = await this.getDoingRepositories();
      const assignment = (await repositories.assignment.load(au.churchId, id)) as Assignment;
      if (assignment.personId !== au.personId) throw new Error("Invalid Assignment");
      else {
        assignment.status = "Accepted";
        return await repositories.assignment.save(assignment);
      }
    });
  }

  @httpPost("/decline/:id")
  public async decline(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, []>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repositories = await this.getDoingRepositories();
      const assignment = (await repositories.assignment.load(au.churchId, id)) as Assignment;
      if (assignment.personId !== au.personId) throw new Error("Invalid Assignment");
      else {
        assignment.status = "Declined";
        return await repositories.assignment.save(assignment);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Assignment[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repositories = await this.getDoingRepositories();
      const promises: Promise<Assignment>[] = [];
      req.body.forEach((assignment) => {
        assignment.churchId = au.churchId;
        if (!assignment.status) assignment.status = "Unconfirmed";
        promises.push(repositories.assignment.save(assignment));
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
      await repositories.assignment.delete(au.churchId, id);
      return {};
    });
  }
}
