import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { List } from "../models/index.js";

// Saved people-search queries ("Lists"). A List stores the advanced-search filter
// spec, not the matched people, so it re-runs live each time it is opened. Lists are
// shared church-wide; reads use People.View, writes use People.Edit.
@controller("/membership/lists")
export class ListController extends MembershipBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      const list = await this.repos.list.load(au.churchId, id);
      return list ?? this.json({ error: "Not found" }, 404);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      return this.repos.list.loadAll(au.churchId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, List[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      const promises: Promise<List>[] = [];
      req.body.forEach((list) => {
        list.churchId = au.churchId;
        if (!list.id) list.createdByPersonId = au.personId;
        promises.push(this.repos.list.save(list));
      });
      return await Promise.all(promises);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      await this.repos.list.delete(au.churchId, id);
      return this.json({});
    });
  }
}
