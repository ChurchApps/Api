import express from "express";
import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import { PlanHelper } from "../helpers/PlanHelper";
import { Plan, PlanItem, Position, Time } from "../models";
import { DoingBaseController } from "./DoingBaseController";

@controller("/doing/plans")
export class PlanController extends DoingBaseController {
  @httpGet("/presenter")
  public async getForPresenter(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.plan.load7Days(au.churchId);
    });
  }

  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = typeof req.query.ids === "string" ? req.query.ids : req.query.ids ? String(req.query.ids) : "";
      if (!idsString) return this.json({ error: "Missing required parameter: ids" });
      const ids = idsString.split(",");
      return await this.repositories.plan.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.plan.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async getForAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.plan.loadAll(au.churchId);
    });
  }

  @httpGet("/types/:planTypeId")
  public async getByPlanTypeId(@requestParam("planTypeId") planTypeId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.plan.loadByPlanTypeId(au.churchId, planTypeId);
    });
  }

  private adjustTime(time: Date, serviceDate: Date, oldServiceDate: Date) {
    const dayDiff = serviceDate.getDate() - oldServiceDate.getDate();
    const result = new Date(time);
    result.setDate(result.getDate() + dayDiff);
    return result;
  }

  @httpPost("/autofill/:id")
  public async autofill(@requestParam("id") id: string, req: express.Request<{}, {}, { teams: { positionId: string; personIds: string[] }[] }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const plan = await this.repositories.plan.load(au.churchId, id);
      const positions: Position[] = (await this.repositories.position.loadByPlanId(au.churchId, id)) as Position[];
      const assignments = (await this.repositories.assignment.loadByPlanId(au.churchId, id)) as any[];
      const blockoutDates = (await this.repositories.blockoutDate.loadUpcoming(au.churchId)) as any[];
      const lastServed = (await this.repositories.assignment.loadLastServed(au.churchId)) as any[];

      await PlanHelper.autofill(positions, assignments, blockoutDates, req.body.teams, lastServed);

      return plan;
    });
  }

  @httpPost("/copy/:id")
  public async copy(@requestParam("id") id: string, req: express.Request<{}, {}, Plan>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const oldPlan = (await this.repositories.plan.load(au.churchId, id)) as Plan;
      const times: Time[] = (await this.repositories.time.loadByPlanId(au.churchId, id)) as Time[];
      const positions: Position[] = (await this.repositories.position.loadByPlanId(au.churchId, id)) as Position[];
      const planItems: PlanItem[] = (await this.repositories.planItem.loadForPlan(au.churchId, id)) as PlanItem[];

      const p = { ...req.body } as Plan;
      p.churchId = au.churchId;
      p.serviceDate = new Date(req.body.serviceDate || new Date());
      const plan = await this.repositories.plan.save(p);

      const promises: Promise<any>[] = [];
      times.forEach((time) => {
        time.id = null as any;
        time.planId = plan.id;
        time.startTime = this.adjustTime(time.startTime || new Date(), plan.serviceDate || new Date(), oldPlan.serviceDate || new Date());
        time.endTime = this.adjustTime(time.endTime || new Date(), plan.serviceDate || new Date(), oldPlan.serviceDate || new Date());
        promises.push(this.repositories.time.save(time));
      });
      positions.forEach((position) => {
        position.id = null as any;
        position.planId = plan.id;
        promises.push(this.repositories.position.save(position));
      });

      const idMap = new Map<string, string>(); // oldId -> newId
      const piPromises: Promise<any>[] = [];

      for (const pi of planItems) {
        const oldId = pi.id;
        pi.id = null as any;
        pi.planId = plan.id;
        piPromises.push(
          this.repositories.planItem.save(pi).then((saved) => {
            if (oldId) idMap.set(oldId, saved.id || "");
            return saved;
          })
        );
      }

      const newPlanItems = (await Promise.all(piPromises)) as PlanItem[];
      const updatePromises: Promise<any>[] = [];
      for (const pi of newPlanItems) {
        if (pi.parentId && idMap.has(pi.parentId)) {
          const newParentId = idMap.get(pi.parentId);
          if (newParentId) pi.parentId = newParentId;
          updatePromises.push(this.repositories.planItem.save(pi));
        }
      }

      await Promise.all(updatePromises);

      await Promise.all(promises);
      return plan;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Plan[] | Plan>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      // Handle both single plan object and array of plans
      const plans = Array.isArray(req.body) ? req.body : [req.body];

      const promises: Promise<Plan>[] = [];
      plans.forEach((plan) => {
        plan.churchId = au.churchId;
        if (plan.serviceDate) {
          plan.serviceDate = new Date(plan.serviceDate);
        }
        promises.push(this.repositories.plan.save(plan));
      });
      const result = await Promise.all(promises);

      // Return single object if input was single object, array if input was array
      return Array.isArray(req.body) ? result : result[0];
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.time.deleteByPlanId(au.churchId, id);
      await this.repositories.assignment.deleteByPlanId(au.churchId, id);
      await this.repositories.position.deleteByPlanId(au.churchId, id);
      await this.repositories.planItem.deleteByPlanId(au.churchId, id);
      await this.repositories.plan.delete(au.churchId, id);
      return {};
    });
  }
}
