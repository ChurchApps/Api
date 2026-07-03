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

  @httpGet("/caddy/init")
  public async caddyInit(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await CaddyHelper.initializeCaddy();
    });
  }

  @httpGet("/authorize")
  public async authorize(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const domain = typeof req.query.domain === "string" ? req.query.domain.toLowerCase().trim() : "";
      if (!domain) return this.json({}, 404);
      const row = await this.repos.domain.loadByName(domain);
      // Caddy only reads the status; the body is for humans debugging with curl/browser.
      return row ? this.json({ authorized: true }, 200) : this.json({}, 404);
    });
  }

  @httpGet("/hostmap")
  public async hostmap(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const pairs = (await this.repos.domain.loadPairs()) as { host: string; dial: string }[];
      const seen = new Set<string>();
      const lines: string[] = [];
      pairs.forEach((p) => {
        if (!p.host || seen.has(p.host)) return;
        seen.add(p.host);
        lines.push(p.host + " " + p.dial.replace(/:443$/, ""));
      });
      lines.sort();
      res.set("Content-Type", "text/plain");
      res.send(lines.join("\n"));
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
          domain.domainName = (domain.domainName || "").toLowerCase().trim();
          domain.siteId = domain.siteId || "";
          if (!domain.domainName || /\s/.test(domain.domainName)) return;
          promises.push(this.repos.domain.save(domain));
        });
        const result = await Promise.all(promises);
        try {
          await CaddyHelper.updateCaddy();
        } catch (e) {
          console.error("Edge domain sync failed (non-fatal):", e);
        }
        return result;
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      await this.repos.domain.delete(au.churchId, id);
      try {
        await CaddyHelper.updateCaddy();
      } catch (e) {
        console.error("Edge domain sync failed (non-fatal):", e);
      }
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
