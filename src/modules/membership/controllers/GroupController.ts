import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { MembershipCrudController } from "./MembershipCrudController.js";
import { Group } from "../models/index.js";
import { Permissions } from "../helpers/index.js";
import { ArrayHelper, SlugHelper } from "@churchapps/apihelper";

@controller("/membership/groups")
export class GroupController extends MembershipCrudController {
  protected crudSettings = {
    repoKey: "group",
    permissions: { view: null, edit: Permissions.groups.edit },
    routes: ["getById", "getAll"] as const // Custom POST and DELETE implementations below
  };
  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const campusId = req.query.campusId.toString();
      const serviceId = req.query.serviceId.toString();
      const serviceTimeId = req.query.serviceTimeId.toString();
      return this.repos.group.convertAllToModel(au.churchId, (await this.repos.group.search(au.churchId, campusId, serviceId, serviceTimeId)) as any[]);
    });
  }

  @httpGet("/my/:tag")
  public async getMyTag(@requestParam("tag") tag: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const result = this.repos.group.convertAllToModel(au.churchId, (await this.repos.group.loadAllForPerson(au.personId)) as any[]);
      return result.filter((g) => g.tags.indexOf(tag) > -1);
    });
  }

  @httpGet("/my")
  public async getMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return this.repos.group.convertAllToModel(au.churchId, (await this.repos.group.loadForPerson(au.personId)) as any[]);
    });
  }

  @httpGet("/public/:churchId/slug/:slug")
  public async getPublicSlug(@requestParam("churchId") churchId: string, @requestParam("slug") slug: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return this.repos.group.convertToModel(churchId, await this.repos.group.loadPublicSlug(churchId, slug));
    });
  }

  @httpGet("/public/:churchId/label")
  public async getPublicLabel(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const label = req.query.label.toString();
      return this.repos.group.convertAllToModel(churchId, (await this.repos.group.publicLabel(churchId, label)) as any[]);
    });
  }

  @httpGet("/public/:churchId/:id")
  public async getPublic(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return this.repos.group.convertToModel(churchId, await this.repos.group.load(churchId, id));
    });
  }

  @httpGet("/tag/:tag")
  public async getByTag(@requestParam("tag") tag: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return this.repos.group.convertAllToModel(au.churchId, (await this.repos.group.loadByTag(au.churchId, tag)) as any[]);
    });
  }

  @httpGet("/public/:churchId/tag/:tag")
  public async getPublicByTag(@requestParam("churchId") churchId: string, @requestParam("tag") tag: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return this.repos.group.convertAllToModel(churchId, (await this.repos.group.loadByTag(churchId, tag)) as any[]);
    });
  }

  // Custom POST implementation (slug generation)
  @httpPost("/")
  public async save(req: express.Request<{}, {}, Group[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groups.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Group>[] = [];
        req.body.forEach((group) => {
          group.churchId = au.churchId;
          if (!group.slug) group.slug = SlugHelper.slugifyString(group.name);
          promises.push(this.repos.group.save(group));
        });
        const result = await Promise.all(promises);
        return this.repos.group.convertAllToModel(au.churchId, result);
      }
    });
  }

  // Custom DELETE implementation (ministry tag handling)
  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groups.edit)) return this.json({}, 401);
      else {
        const group: Group = await this.repos.group.load(au.churchId, id);
        if (group.tags.indexOf("ministry") > -1) {
          const AllTeams = (await this.repos.group.loadByTag(au.churchId, "team")) as any[];
          const ministryTeams = ArrayHelper.getAll(AllTeams, "categoryName", id);
          const ids = ArrayHelper.getIds(ministryTeams, "id");
          await this.repos.group.delete(au.churchId, id);
          await this.repos.group.deleteByIds(au.churchId, ids);
          return this.json({});
        } else {
          await this.repos.group.delete(au.churchId, id);
          return this.json({});
        }
      }
    });
  }
}
