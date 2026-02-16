import { controller, httpPost, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipCrudController } from "./MembershipCrudController.js";
import { Domain } from "../models/index.js";
import { CaddyHelper, Permissions } from "../helpers/index.js";
import { DomainHealthHelper } from "../helpers/DomainHealthHelper.js";

@controller("/membership/domains")
export class DomainController extends MembershipCrudController {
  protected crudSettings = {
    repoKey: "domain",
    permissions: { view: null, edit: Permissions.settings.edit },
    routes: ["getById", "getAll", "delete"] as const
  };
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

  @httpGet("/health/check")
  public async runHealthCheck(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await DomainHealthHelper.checkUncheckedDomains();
    });
  }
}
