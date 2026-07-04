import { controller, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { PersonFieldValue } from "../models/index.js";

@controller("/membership/personfieldvalues")
export class PersonFieldValueController extends MembershipBaseController {

  @httpGet("/person/:personId")
  public async getForPerson(@requestParam("personId") personId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      const data = await this.repos.personFieldValue.loadForPerson(au.churchId, personId);
      return this.repos.personFieldValue.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, PersonFieldValue[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      const personIds = new Set<string>();
      for (const item of req.body) {
        await this.repos.personFieldValue.upsert(au.churchId, item.personId, item.fieldId, item.value);
        if (item.personId) personIds.add(item.personId);
      }
      const result: PersonFieldValue[] = [];
      for (const pid of personIds) {
        const rows = await this.repos.personFieldValue.loadForPerson(au.churchId, pid);
        result.push(...this.repos.personFieldValue.convertAllToModel(au.churchId, rows));
      }
      return result;
    });
  }
}
