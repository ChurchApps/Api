import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { ContentProviderAuth } from "../models/index.js";

@controller("/doing/contentProviderAuths")
export class ContentProviderAuthController extends DoingBaseController {
  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = typeof req.query.ids === "string" ? req.query.ids : req.query.ids ? String(req.query.ids) : "";
      if (!idsString) return this.json({ error: "Missing required parameter: ids" });
      const ids = idsString.split(",");
      return await this.repos.contentProviderAuth.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/ministry/:ministryId")
  public async getByMinistry(@requestParam("ministryId") ministryId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.contentProviderAuth.loadByMinistry(au.churchId, ministryId);
    });
  }

  @httpGet("/ministry/:ministryId/:providerId")
  public async getByMinistryAndProvider(
    @requestParam("ministryId") ministryId: string,
    @requestParam("providerId") providerId: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.contentProviderAuth.loadByMinistryAndProvider(au.churchId, ministryId, providerId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.contentProviderAuth.load(au.churchId, id);
      return this.repos.contentProviderAuth.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.contentProviderAuth.loadAll(au.churchId);
      return this.repos.contentProviderAuth.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, ContentProviderAuth[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<ContentProviderAuth>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.contentProviderAuth.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.contentProviderAuth.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.contentProviderAuth.delete(au.churchId, id);
      return {};
    });
  }
}
