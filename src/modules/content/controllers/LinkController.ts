import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { Permissions } from "../helpers/index.js";
import { ContentBaseController } from "./ContentBaseController.js";
import { Link } from "../models/index.js";

@controller("/content/links")
export class LinkController extends ContentBaseController {

  // Authenticated access - filters links by visibility based on user context
  // Note: "team" visibility is handled client-side since group tags aren't in the JWT
  @httpGet("/church/:churchId/filtered")
  public async loadFiltered(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const category = req.query.category?.toString();
      const links = category
        ? await this.repos.link.loadByCategory(churchId, category)
        : await this.repos.link.loadAll(churchId);

      // Filter links based on visibility (except "team" which needs client-side check)
      return links.filter((link: Link) => this.isLinkVisible(link, au));
    });
  }

  private isLinkVisible(link: Link, au: any): boolean {
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
  public async loadAnon(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const category = req.query.category.toString();
      if (category === undefined) return await this.repos.link.loadAll(churchId);
      else return await this.repos.link.loadByCategory(churchId, category);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.link.load(au.churchId, id);
      return this.repos.link.convertToModel(au.churchId, data);
    });
  }

  // Override GET / to support optional category filter
  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const category = req.query?.category?.toString();
      const data = category ? await this.repos.link.loadByCategory(au.churchId, category) : await this.repos.link.loadAll(au.churchId);
      return this.repos.link.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Link[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const promises: Promise<Link>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.link.save(item)); });
      const result = await Promise.all(promises);
      // Post-save sort behavior
      if (result.length > 0) {
        try {
          await this.repos.link.sort(au.churchId, result[0].category, result[0].parentId);
        } catch {
          // ignore sort errors
        }
      }
      return this.repos.link.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await this.repos.link.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
