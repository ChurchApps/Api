import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Assignment, Plan, Position } from "../models/index.js";

@controller("/doing/assignments")
export class AssignmentController extends DoingBaseController {
  @httpGet("/my")
  public async getMy(@requestParam("id") _id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.assignment.loadByByPersonId(au.churchId, au.personId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.assignment.load(au.churchId, id);
    });
  }

  @httpGet("/plan/ids")
  public async getByPlanIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const planIdsString = req.query.planIds as string;
      const planIds = planIdsString.split(",");
      return await this.repos.assignment.loadByPlanIds(au.churchId, planIds);
    });
  }

  @httpGet("/plan/:planId")
  public async getForPlan(@requestParam("planId") planId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.assignment.loadByPlanId(au.churchId, planId);
    });
  }

  @httpPost("/accept/:id")
  public async accept(@requestParam("id") id: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const assignment = (await this.repos.assignment.load(au.churchId, id)) as Assignment;
      if (assignment.personId !== au.personId) throw new Error("Invalid Assignment");
      else {
        assignment.status = "Accepted";
        return await this.repos.assignment.save(assignment);
      }
    });
  }

  @httpPost("/decline/:id")
  public async decline(@requestParam("id") id: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const assignment = (await this.repos.assignment.load(au.churchId, id)) as Assignment;
      if (assignment.personId !== au.personId) throw new Error("Invalid Assignment");
      else {
        assignment.status = "Declined";
        return await this.repos.assignment.save(assignment);
      }
    });
  }

  @httpPost("/signup")
  public async signup(req: express.Request<{}, {}, { positionId: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { positionId } = req.body;
      if (!positionId) throw new Error("positionId is required");

      const position = (await this.repos.position.load(au.churchId, positionId)) as Position;
      if (!position || !position.allowSelfSignup) throw new Error("Self-signup is not enabled for this position");

      // Check signup deadline
      const plan = (await this.repos.plan.load(au.churchId, position.planId)) as Plan;
      if (plan.signupDeadlineHours) {
        const deadline = new Date(plan.serviceDate);
        deadline.setHours(deadline.getHours() - plan.signupDeadlineHours);
        if (new Date() > deadline) throw new Error("Signup deadline has passed");
      }

      // Check capacity
      const countResult = await this.repos.assignment.countByPositionId(au.churchId, positionId);
      if (countResult.cnt >= position.count) throw new Error("Position is full");

      // Check duplicate
      const existing = await this.repos.assignment.loadByPlanId(au.churchId, position.planId) as Assignment[];
      const alreadyAssigned = existing.find(a => a.positionId === positionId && a.personId === au.personId);
      if (alreadyAssigned) throw new Error("Already signed up for this position");

      const assignment = new Assignment();
      assignment.churchId = au.churchId;
      assignment.positionId = positionId;
      assignment.personId = au.personId;
      assignment.status = "Accepted";
      return await this.repos.assignment.save(assignment);
    });
  }

  @httpDelete("/signup/:id")
  public async signupRemove(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const assignment = (await this.repos.assignment.load(au.churchId, id)) as Assignment;
      if (!assignment || assignment.personId !== au.personId) throw new Error("Invalid assignment");

      const position = (await this.repos.position.load(au.churchId, assignment.positionId)) as Position;
      if (!position || !position.allowSelfSignup) throw new Error("Self-signup is not enabled for this position");

      // Check removal deadline
      const plan = (await this.repos.plan.load(au.churchId, position.planId)) as Plan;
      if (plan.signupDeadlineHours) {
        const deadline = new Date(plan.serviceDate);
        deadline.setHours(deadline.getHours() - plan.signupDeadlineHours);
        if (new Date() > deadline) throw new Error("Removal deadline has passed");
      }

      await this.repos.assignment.delete(au.churchId, id);
      return {};
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Assignment[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Assignment>[] = [];
      req.body.forEach((assignment) => {
        assignment.churchId = au.churchId;
        if (!assignment.status) assignment.status = "Unconfirmed";
        promises.push(this.repos.assignment.save(assignment));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.assignment.delete(au.churchId, id);
      return {};
    });
  }
}
