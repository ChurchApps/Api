import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { Permissions } from "../helpers/index.js";
import { ContentBaseController } from "./ContentBaseController.js";
import { Link } from "../models/index.js";
import { AuthenticatedUser } from "@churchapps/apihelper";

// Links on a person's record are staff-only: never listed through the public or member link routes.
const PERSON_LINK_CATEGORY = "personLink";
const isPersonLink = (link: { category?: string } | null | undefined) => link?.category === PERSON_LINK_CATEGORY;

@controller("/content/links")
export class LinkController extends ContentBaseController {

  // Authenticated access - filters links by visibility based on user context
  // Note: "team" visibility is handled client-side since group tags aren't in the JWT
  @httpGet("/church/:churchId/filtered")
  public async loadFiltered(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const category = req.query.category?.toString();
      if (category === PERSON_LINK_CATEGORY) return [];
      const siteId = (typeof req.query.siteId === "string" ? req.query.siteId : "");
      const links = category
        ? await this.repos.link.loadByCategory(churchId, category, siteId)
        : (await this.repos.link.loadAll(churchId, siteId)).filter((l: Link) => !isPersonLink(l));

      // Filter links based on visibility (except "team" which needs client-side check)
      const viewer = au.churchId === churchId ? au : {};
      return links.filter((link: Link) => this.isLinkVisible(link, viewer));
    });
  }

  private isLinkVisible(link: Link, au: Partial<Pick<AuthenticatedUser, "personId" | "membershipStatus" | "groupIds">>): boolean {
    const visibility = link.visibility || "everyone";

    switch (visibility) {
      case "everyone": return true;
      case "visitors": return !!au.personId;
      case "members": {
        const status = au.membershipStatus?.toLowerCase();
        return status === "member" || status === "staff";
      }
      case "staff": return au.membershipStatus?.toLowerCase() === "staff";
      case "team": return true; // Pass through to client - client will check group tags
      case "groups": {
        if (!link.groupIds) return false;
        try {
          const linkGroupIds: string[] = JSON.parse(link.groupIds);
          if (!linkGroupIds.length) return false;
          return linkGroupIds.some(gid => au.groupIds?.includes(gid));
        } catch {
          return false;
        }
      }
      default: return true;
    }
  }

  // Anonymous access
  @httpGet("/church/:churchId")
  public async loadAnon(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => {
      const category = req.query.category?.toString();
      if (category === PERSON_LINK_CATEGORY) return [];
      const siteId = (typeof req.query.siteId === "string" ? req.query.siteId : "");
      if (!category) return (await this.repos.link.loadAll(churchId, siteId)).filter((l: Link) => !isPersonLink(l));
      else return await this.repos.link.loadByCategory(churchId, category, siteId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.link.load(au.churchId, id);
      if (isPersonLink(data) && !au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      return this.repos.link.convertToModel(au.churchId, data);
    });
  }

  // Override GET / to support optional category filter
  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const category = req.query?.category?.toString();
      if (category === PERSON_LINK_CATEGORY) {
        if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
        const personId = req.query.linkData?.toString();
        if (!personId) return [];
        return this.repos.link.convertAllToModel(au.churchId, await this.repos.link.loadByCategoryAndData(au.churchId, category, personId));
      }
      const siteId = (typeof req.query.siteId === "string" ? req.query.siteId : "");
      const data = category ? await this.repos.link.loadByCategory(au.churchId, category, siteId) : (await this.repos.link.loadAll(au.churchId, siteId)).filter((l: Link) => !isPersonLink(l));
      return this.repos.link.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Link[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!(await this.canSave(au, req.body))) return this.json({}, 401);
      const promises: Promise<Link>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; item.siteId = item.siteId || ""; promises.push(this.repos.link.save(item)); });
      const result = await Promise.all(promises);
      // Post-save sort behavior
      if (result.length > 0) {
        try {
          await this.repos.link.sort(au.churchId, result[0].category, result[0].parentId, result[0].siteId);
        } catch {
          // ignore sort errors
        }
      }
      this.bumpSiteCache(au.churchId);
      return this.repos.link.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const existing = await this.repos.link.load(au.churchId, id);
      const permission = isPersonLink(existing) ? Permissions.people.edit : Permissions.content.edit;
      if (!au.checkAccess(permission)) return this.json({}, 401);
      else {
        await this.repos.link.delete(au.churchId, id);
        this.bumpSiteCache(au.churchId);
        return this.json({});
      }
    });
  }

  // Person links need Edit People (and nothing else in the batch); every other link needs content edit.
  // An existing row keeps the rule of its stored category, so an id can't be used to cross between them.
  private async canSave(au: AuthenticatedUser, links: Link[]): Promise<boolean> {
    if (!Array.isArray(links) || links.length === 0) return au.checkAccess(Permissions.content.edit);
    const personLinks = links.filter((l) => isPersonLink(l));
    if (personLinks.length > 0 && personLinks.length !== links.length) return false;
    for (const link of links) {
      if (!link.id) continue;
      const existing = await this.repos.link.load(au.churchId, link.id);
      if (existing && isPersonLink(existing) !== isPersonLink(link)) return false;
    }
    if (personLinks.length > 0) return au.checkAccess(Permissions.people.edit) && personLinks.every((l) => !!l.linkData);
    return au.checkAccess(Permissions.content.edit);
  }
}
