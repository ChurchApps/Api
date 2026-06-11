import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { SchedulingPreference } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/schedulingPreferences")
export class SchedulingPreferenceController extends DoingBaseController {
  @httpGet("/my")
  public async getMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.schedulingPreference.loadForPerson(au.churchId, au.personId);
    });
  }

  @httpGet("/people")
  public async getForPeople(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = typeof req.query.ids === "string" ? req.query.ids : "";
      if (!idsString) return [];
      return await this.repos.schedulingPreference.loadByPersonIds(au.churchId, idsString.split(","));
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.schedulingPreference.load(au.churchId, id);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, SchedulingPreference[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const canEditOthers = au.checkAccess(Permissions.plans.edit);
      const promises: Promise<SchedulingPreference>[] = [];
      for (const pref of req.body) {
        pref.churchId = au.churchId;
        if (!pref.personId) pref.personId = au.personId;
        if (pref.personId !== au.personId && !canEditOthers) return this.json({}, 401);
        promises.push(this.repos.schedulingPreference.save(pref));
      }
      return await Promise.all(promises);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const pref = (await this.repos.schedulingPreference.load(au.churchId, id)) as SchedulingPreference;
      if (!pref) return {};
      if (pref.personId !== au.personId && !au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      await this.repos.schedulingPreference.delete(au.churchId, id);
      return {};
    });
  }
}
