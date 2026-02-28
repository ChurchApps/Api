import express from "express";
import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import { PlanHelper } from "../helpers/PlanHelper.js";
import { Assignment, Plan, PlanItem, Position, Time } from "../models/index.js";
import { DoingBaseController } from "./DoingBaseController.js";

@controller("/doing/plans")
export class PlanController extends DoingBaseController {
  @httpGet("/presenter")
  public async getForPresenter(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.plan.load7Days(au.churchId);
    });
  }

  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = typeof req.query.ids === "string" ? req.query.ids : req.query.ids ? String(req.query.ids) : "";
      if (!idsString) return this.json({ error: "Missing required parameter: ids" });
      const ids = idsString.split(",");
      return await this.repos.plan.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.plan.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async getForAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.plan.loadAll(au.churchId);
    });
  }

  @httpGet("/types/:planTypeId")
  public async getByPlanTypeId(@requestParam("planTypeId") planTypeId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.plan.loadByPlanTypeId(au.churchId, planTypeId);
    });
  }

  @httpGet("/public/current/:planTypeId")
  public async getCurrentByPlanType(@requestParam("planTypeId") planTypeId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await this.repos.plan.loadCurrentByPlanTypeId(planTypeId);
    });
  }

  @httpGet("/public/signup/:churchId")
  public async getSignupPlans(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const plans: Plan[] = (await this.repos.plan.loadSignupPlans(churchId)) as Plan[];
      if (plans.length === 0) return [];

      const planIds = plans.map(p => p.id);
      const allPositions: Position[] = (await this.repos.position.loadByPlanIds(churchId, planIds)) as Position[];
      const allAssignments: Assignment[] = (await this.repos.assignment.loadByPlanIds(churchId, planIds)) as Assignment[];
      const allTimes: Time[] = (await this.repos.time.loadByPlanIds(churchId, planIds)) as Time[];

      return plans.map(plan => {
        const positions = allPositions
          .filter(p => p.planId === plan.id && p.allowSelfSignup)
          .map(p => {
            const filledCount = allAssignments.filter(a => a.positionId === p.id && (a.status === "Accepted" || a.status === "Unconfirmed")).length;
            return { ...p, filledCount };
          });
        const times = allTimes.filter(t => t.planId === plan.id);
        return { plan, positions, times };
      });
    });
  }

  private adjustTime(time: Date, serviceDate: Date, oldServiceDate: Date) {
    const dayDiff = serviceDate.getDate() - oldServiceDate.getDate();
    const result = new Date(time);
    result.setDate(result.getDate() + dayDiff);
    return result;
  }

  private async copyTimesAndPositions(churchId: string, sourcePlanId: string, targetPlan: Plan, oldPlan: Plan, copyAssignments: boolean): Promise<void> {
    const times: Time[] = await this.repos.time.loadByPlanId(churchId, sourcePlanId) as Time[];
    const positions: Position[] = await this.repos.position.loadByPlanId(churchId, sourcePlanId) as Position[];
    const positionIdMap = new Map<string, string>();
    const promises: Promise<any>[] = [];

    // Copy times
    for (const time of times) {
      time.id = null as any;
      time.planId = targetPlan.id;
      time.startTime = this.adjustTime(time.startTime || new Date(), targetPlan.serviceDate || new Date(), oldPlan.serviceDate || new Date());
      time.endTime = this.adjustTime(time.endTime || new Date(), targetPlan.serviceDate || new Date(), oldPlan.serviceDate || new Date());
      promises.push(this.repos.time.save(time));
    }

    // Copy positions and track old->new id mapping
    for (const position of positions) {
      const oldPositionId = position.id;
      position.id = null as any;
      position.planId = targetPlan.id;
      const savedPosition = await this.repos.position.save(position);
      if (oldPositionId) positionIdMap.set(oldPositionId, savedPosition.id || "");
    }

    // Copy assignments if requested
    if (copyAssignments) {
      const assignments = await this.repos.assignment.loadByPlanId(churchId, sourcePlanId);
      for (const assignment of assignments) {
        const newPositionId = positionIdMap.get(assignment.positionId || "");
        if (newPositionId) {
          assignment.id = null as any;
          assignment.planId = targetPlan.id;
          assignment.positionId = newPositionId;
          assignment.status = "Unconfirmed";
          promises.push(this.repos.assignment.save(assignment));
        }
      }
    }

    await Promise.all(promises);
  }

  private async copyServiceOrderItems(churchId: string, sourcePlanId: string, targetPlanId: string): Promise<void> {
    const planItems: PlanItem[] = await this.repos.planItem.loadForPlan(churchId, sourcePlanId) as PlanItem[];
    const parentIdMap = new Map<string, string>();

    // First pass: save items without parentId (top-level headers)
    for (const item of planItems.filter(pi => !pi.parentId)) {
      const oldId = item.id;
      item.id = undefined;
      item.planId = targetPlanId;
      const savedItem = await this.repos.planItem.save(item);
      if (oldId) parentIdMap.set(oldId, savedItem.id || "");
    }

    // Second pass: save child items with updated parentId
    for (const item of planItems.filter(pi => pi.parentId)) {
      const newParentId = parentIdMap.get(item.parentId || "");
      if (newParentId) {
        item.id = undefined;
        item.planId = targetPlanId;
        item.parentId = newParentId;
        await this.repos.planItem.save(item);
      }
    }
  }

  @httpPost("/autofill/:id")
  public async autofill(@requestParam("id") id: string, req: express.Request<{}, {}, { teams: { positionId: string; personIds: string[] }[] }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const plan = await this.repos.plan.load(au.churchId, id);
      const positions: Position[] = (await this.repos.position.loadByPlanId(au.churchId, id)) as Position[];
      const assignments = (await this.repos.assignment.loadByPlanId(au.churchId, id)) as any[];
      const blockoutDates = (await this.repos.blockoutDate.loadUpcoming(au.churchId)) as any[];
      const lastServed = (await this.repos.assignment.loadLastServed(au.churchId)) as any[];
      const assignmentsOnSameDate = (await this.repos.assignment.loadByServiceDate(au.churchId, plan.serviceDate || new Date(), id)) as any[];

      await PlanHelper.autofill(positions, assignments, blockoutDates, req.body.teams, lastServed, assignmentsOnSameDate);

      return plan;
    });
  }

  @httpPost("/copy/:id")
  public async copy(@requestParam("id") id: string, req: express.Request<{}, {}, Plan & { copyMode?: string; copyServiceOrder?: boolean }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const copyMode = req.body.copyMode || "all"; // "none" | "positions" | "all"
      const copyServiceOrder = req.body.copyServiceOrder || false;
      const oldPlan = (await this.repos.plan.load(au.churchId, id)) as Plan;

      const p = { ...req.body } as Plan;
      delete (p as any).copyMode;
      delete (p as any).copyServiceOrder;
      p.churchId = au.churchId;
      p.serviceDate = new Date(req.body.serviceDate || new Date());
      const plan = await this.repos.plan.save(p);

      if (copyMode !== "none") {
        await this.copyTimesAndPositions(au.churchId, id, plan, oldPlan, copyMode === "all");
      }

      if (copyServiceOrder) {
        await this.copyServiceOrderItems(au.churchId, id, plan.id!);
      }

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
        promises.push(this.repos.plan.save(plan));
      });
      const result = await Promise.all(promises);

      // Return single object if input was single object, array if input was array
      return Array.isArray(req.body) ? result : result[0];
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.time.deleteByPlanId(au.churchId, id);
      await this.repos.assignment.deleteByPlanId(au.churchId, id);
      await this.repos.position.deleteByPlanId(au.churchId, id);
      await this.repos.planItem.deleteByPlanId(au.churchId, id);
      await this.repos.plan.delete(au.churchId, id);
      return {};
    });
  }
}
