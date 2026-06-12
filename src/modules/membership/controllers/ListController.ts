import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { ListRuleHelper, Permissions } from "../helpers/index.js";
import { List, ListRuleGroup } from "../models/index.js";

// Saved people-search queries ("Lists"). A List stores its query — a provider-scoped
// rules tree (plus the legacy filter blob for re-seeding the UI) — not the matched
// people, so it re-runs live each time it is opened. Scope "private" hides a list from
// everyone but its creator; "org" shares it church-wide. Reads use People.View, writes
// use People.Edit.
@controller("/membership/lists")
export class ListController extends MembershipBaseController {
  private canView(list: List, personId: string) {
    if (!list) return false;
    return list.scope !== "private" || list.createdByPersonId === personId;
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      const list = await this.repos.list.load(au.churchId, id);
      if (!list || !this.canView(list, au.personId)) return this.json({ error: "Not found" }, 404);
      return list;
    });
  }

  // Evaluates the list's rules tree server-side and returns the matching people.
  @httpGet("/:id/people")
  public async getPeople(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      const list = await this.repos.list.load(au.churchId, id);
      if (!list || !this.canView(list, au.personId)) return this.json({ error: "Not found" }, 404);
      if (!list.rules) return this.json({ error: "List has no rules" }, 400);
      const personIds = await ListRuleHelper.getPeopleIds(au.churchId, list, this.repos);
      const data = await this.repos.person.loadByIds(au.churchId, personIds);
      return this.repos.person.convertAllToModelWithPermissions(au.churchId, data as any[], au.checkAccess(Permissions.people.edit));
    });
  }

  // Evaluates an unsaved rules tree — lets the UI preview matches before saving.
  @httpPost("/preview")
  public async preview(req: express.Request<{}, {}, { rules: ListRuleGroup; householdInclusion?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      if (!req.body?.rules) return this.json({ error: "rules is required" }, 400);
      const personIds = await ListRuleHelper.evaluate(au.churchId, req.body.rules, req.body.householdInclusion, this.repos);
      const data = await this.repos.person.loadByIds(au.churchId, personIds);
      return this.repos.person.convertAllToModelWithPermissions(au.churchId, data as any[], au.checkAccess(Permissions.people.edit));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      return this.repos.list.loadAll(au.churchId, au.personId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, List[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      const promises: Promise<List>[] = [];
      for (const list of req.body) {
        list.churchId = au.churchId;
        if (!list.id) list.createdByPersonId = au.personId;
        else {
          const existing = await this.repos.list.load(au.churchId, list.id);
          if (!existing || !this.canView(existing, au.personId)) return this.json({ error: "Not found" }, 404);
          list.createdByPersonId = existing.createdByPersonId;
        }
        promises.push(this.repos.list.save(list));
      }
      return await Promise.all(promises);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      const existing = await this.repos.list.load(au.churchId, id);
      if (existing && !this.canView(existing, au.personId)) return this.json({ error: "Not found" }, 404);
      await this.repos.list.delete(au.churchId, id);
      return this.json({});
    });
  }
}
