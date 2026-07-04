import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { PersonField } from "../models/index.js";

@controller("/membership/personfields")
export class PersonFieldController extends MembershipBaseController {

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      const data = await this.repos.personField.loadAll(au.churchId);
      return this.repos.personField.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, PersonField[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      const promises: Promise<PersonField>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.personField.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.personField.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      await this.repos.personFieldValue.deleteForField(au.churchId, id);
      await this.repos.personField.delete(au.churchId, id);
      return {};
    });
  }
}
