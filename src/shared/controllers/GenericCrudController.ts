import { httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { BaseController } from "../infrastructure";
import { CrudHelper } from "./CrudHelper";

export interface CrudPermissions {
  view?: any;
  edit?: any;
}

export type CrudRoute = "getById" | "getAll" | "post" | "delete";

export interface CrudSettings {
  repoKey: string;
  permissions: CrudPermissions;
  routes: ReadonlyArray<CrudRoute>;
}

// Base controller that provides common CRUD endpoints.
// Subclasses must decorate themselves with @controller(path) and provide crudSettings.
export abstract class GenericCrudController extends BaseController {
  public repositories: any;
  protected abstract crudSettings: CrudSettings;

  constructor(moduleName: string) {
    super(moduleName);
  }

  // GET /:id
  @httpGet(":id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    if (!this.crudSettings.routes.includes("getById")) return this.json({}, 404);
    return CrudHelper.getByIdWrapped(this, req, res, this.crudSettings.permissions.view || null, this.crudSettings.repoKey, id);
  }

  // GET /
  @httpGet("")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    if (!this.crudSettings.routes.includes("getAll")) return this.json({}, 404);
    return CrudHelper.listWrapped(
      this,
      req,
      res,
      this.crudSettings.repoKey,
      (repos, au) => repos[this.crudSettings.repoKey].loadAll(au.churchId),
      this.crudSettings.permissions.view || null
    );
  }

  // POST /
  @httpPost("")
  public async save(req: express.Request, res: express.Response): Promise<any> {
    if (!this.crudSettings.routes.includes("post")) return this.json({}, 404);
    return CrudHelper.saveManyWrapped(this, req as any, res, this.crudSettings.permissions.edit, this.crudSettings.repoKey);
  }

  // DELETE /:id
  @httpDelete(":id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    if (!this.crudSettings.routes.includes("delete")) return this.json({}, 404);
    return CrudHelper.deleteWrapped(
      this,
      req,
      res,
      this.crudSettings.permissions.edit,
      this.crudSettings.repoKey,
      (repos, au) => repos[this.crudSettings.repoKey].delete(au.churchId, id)
    );
  }
}
