import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { ListRuleHelper, Permissions } from "../helpers/index.js";
import { List, ListRuleGroup } from "../models/index.js";

@controller("/membership/lists")
export class ListController extends MembershipBaseController {
  private canView(list: List, personId: string) {
    if (!list) return false;
    return list.scope !== "private" || list.createdByPersonId === personId;
  }

  // Giving rules reveal who gave, so they need the same donation view the giving search requires.
  private async givingBlocked(au: AuthenticatedUser, rules: ListRuleGroup | undefined) {
    if (au.checkAccess(Permissions.donations.view)) return false;
    return ListRuleHelper.usesGiving(au.churchId, rules, this.repos);
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      const list = await this.repos.list.load(au.churchId, id);
      if (!list || !this.canView(list, au.personId)) return this.json({ error: "Not found" }, 404);
      return list;
    });
  }

  @httpGet("/:id/people")
  public async getPeople(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      const list = await this.repos.list.load(au.churchId, id);
      if (!list || !this.canView(list, au.personId)) return this.json({ error: "Not found" }, 404);
      if (!list.rules) return this.json({ error: "List has no rules" }, 400);
      if (await this.givingBlocked(au, list.rules)) return this.json({}, 401);
      const personIds = await ListRuleHelper.getPeopleIds(au.churchId, list, this.repos);
      const data = await this.repos.person.loadByIds(au.churchId, personIds);
      return this.repos.person.convertAllToModelWithPermissions(au.churchId, data, au.checkAccess(Permissions.people.edit));
    });
  }

  @httpPost("/preview")
  public async preview(req: express.Request<{}, {}, { rules: ListRuleGroup; householdInclusion?: string }>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      if (!req.body?.rules) return this.json({ error: "rules is required" }, 400);
      if (await this.givingBlocked(au, req.body.rules)) return this.json({}, 401);
      const personIds = await ListRuleHelper.evaluate(au.churchId, req.body.rules, req.body.householdInclusion, this.repos, undefined, au.personId);
      const data = await this.repos.person.loadByIds(au.churchId, personIds);
      return this.repos.person.convertAllToModelWithPermissions(au.churchId, data, au.checkAccess(Permissions.people.edit));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      return this.repos.list.loadAll(au.churchId, au.personId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, List[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      for (const list of req.body) {
        if (await this.givingBlocked(au, list.rules)) return this.json({}, 401);
        list.churchId = au.churchId;
        if (!list.id) list.createdByPersonId = au.personId;
        else {
          const existing = await this.repos.list.load(au.churchId, list.id);
          if (!existing || !this.canView(existing, au.personId)) return this.json({ error: "Not found" }, 404);
          list.createdByPersonId = existing.createdByPersonId;
        }
      }
      return await Promise.all(req.body.map((list) => this.repos.list.save(list)));
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      const existing = await this.repos.list.load(au.churchId, id);
      if (existing && !this.canView(existing, au.personId)) return this.json({ error: "Not found" }, 404);
      await this.repos.list.delete(au.churchId, id);
      return this.json({});
    });
  }
}
