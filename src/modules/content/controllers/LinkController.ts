import { controller, httpGet, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { Permissions } from "../helpers";
import { ContentCrudController } from "./ContentCrudController";
import { Link } from "../models";
import { CrudHelper } from "../../../shared/controllers";

@controller("/content/links")
export class LinkController extends ContentCrudController {
  protected crudSettings = {
    repoKey: "link",
    permissions: { view: undefined, edit: Permissions.content.edit },
    routes: ["getById", "getAll", "post", "delete"] as const
  };
  // Anonymous access
  @httpGet("/church/:churchId")
  public async loadAnon(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const category = req.query.category.toString();
      if (category === undefined) return await this.repos.link.loadAll(churchId);
      else return await this.repos.link.loadByCategory(churchId, category);
    });
  }

  // Override GET / to support optional category filter and custom sort after save
  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const category = req.query?.category?.toString();
      const data = category ? await this.repos.link.loadByCategory(au.churchId, category) : await this.repos.link.loadAll(au.churchId);
      return this.repos.link.convertAllToModel(au.churchId, data);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await this.repos.link.delete(id, au.churchId);
        return this.json({});
      }
    });
  }

  // Use base POST / but add post-save sort behavior
  public override async save(req: express.Request<{}, {}, Link[]>, res: express.Response): Promise<any> {
    const result = (await CrudHelper.saveManyWrapped<Link>(this, req as any, res, Permissions.content.edit, "link", (item, churchId) => (item.churchId = churchId))) as Link[];
    if (Array.isArray(result) && result.length > 0) {
      const au: any = (req as any).user || {};
      try {
        await this.repos.link.sort(au.churchId, result[0].category, result[0].parentId);
      } catch {
        // ignore sort errors
      }
    }
    return result as any;
  }

  /*
  private async savePhoto(churchId: string, link: Link) {
    const base64 = link.photo.split(',')[1];
    const key = "/" + churchId + "/tabs/" + link.id + ".png";
    return FileStorageHelper.store(key, "image/png", Buffer.from(base64, 'base64')).then(async () => {
      link.photo = EnvironmentBase.contentRoot + key + "?dt=" + new Date().getTime().toString();
      await this.repos.link.save(link);
    });
  }
  */
}
