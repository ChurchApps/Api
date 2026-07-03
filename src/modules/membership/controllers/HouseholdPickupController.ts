import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { HouseholdPickupPerson } from "../models/index.js";

@controller("/membership/householdpickup")
export class HouseholdPickupController extends MembershipBaseController {
  @httpGet("/:householdId")
  public async getForHousehold(@requestParam("householdId") householdId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.householdPickupPerson.loadByHousehold(au.churchId, householdId);
      return this.repos.householdPickupPerson.convertAllToModel(au.churchId, data as any[]);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, HouseholdPickupPerson[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      const promises: Promise<HouseholdPickupPerson>[] = [];
      req.body.forEach((item) => {
        item.churchId = au.churchId;
        promises.push(this.repos.householdPickupPerson.save(item));
      });
      const result = await Promise.all(promises);
      return this.repos.householdPickupPerson.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      await this.repos.householdPickupPerson.delete(au.churchId, id);
      return this.json({});
    });
  }
}
