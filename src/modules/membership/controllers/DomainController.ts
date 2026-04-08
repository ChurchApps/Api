import { controller, httpPost, httpGet, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Domain } from "../models/index.js";
import { CaddyHelper, Permissions } from "../helpers/index.js";
import { DomainHealthHelper } from "../helpers/DomainHealthHelper.js";

@controller("/membership/domains")
export class DomainController extends MembershipBaseController {
  @httpGet("/caddy")
  public async caddy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const jsonData = await CaddyHelper.generateJsonData();
      await CaddyHelper.updateCaddy();
      return jsonData;
    });
  }

  @httpGet("/test")
  public async test(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const jsonData = await CaddyHelper.generateJsonData();
      return jsonData;
    });
  }

  @httpGet("/caddy/init")
  public async caddyInit(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await CaddyHelper.initializeCaddy();
    });
  }

  @httpGet("/lookup/:domainName")
  public async getByName(@requestParam("domainName") domainName: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      return await this.repos.domain.loadByName(domainName);
    });
  }

  @httpGet("/public/lookup/:domainName")
  public async getPublicByName(@requestParam("domainName") domainName: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await this.repos.domain.loadByName(domainName);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.domain.load(au.churchId, id);
      return this.repos.domain.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.domain.loadAll(au.churchId);
      return this.repos.domain.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Domain[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Domain>[] = [];
        req.body.forEach((domain) => {
          domain.churchId = au.churchId;
          promises.push(this.repos.domain.save(domain));
        });
        const result = await Promise.all(promises);
        await CaddyHelper.updateCaddy();
        return result;
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      await this.repos.domain.delete(au.churchId, id);
      return {};
    });
  }

  @httpGet("/health/check")
  public async runHealthCheck(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await DomainHealthHelper.checkUncheckedDomains();
    });
  }
}
