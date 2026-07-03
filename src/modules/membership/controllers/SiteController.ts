import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Site } from "../models/index.js";
import { CaddyHelper, Permissions } from "../helpers/index.js";
import { getContentModuleGateway } from "../../../shared/modules/ContentModuleGateway.js";

@controller("/membership/sites")
export class SiteController extends MembershipBaseController {
  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.site.loadAll(au.churchId);
      return this.repos.site.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Site[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const sites = req.body;
      const errors: string[] = [];
      const seen = new Set<string>();
      for (const site of sites) {
        site.churchId = au.churchId;
        site.subDomain = (site.subDomain || "").toLowerCase().trim();
        if (!site.name || site.name.trim() === "") errors.push("Site name required");
        if (!site.subDomain) errors.push("Subdomain required");
        else if (/^([a-z0-9]{1,99})$/.test(site.subDomain) === false) errors.push("Please enter only lower case letters and numbers for the subdomain.  Example: firstchurch");
        else if (seen.has(site.subDomain)) errors.push("Subdomain unavailable");
        else {
          seen.add(site.subDomain);
          // Church + site subdomains share one global namespace — any collision is unavailable.
          const church = await this.repos.church.loadBySubDomain(site.subDomain);
          if (church) errors.push("Subdomain unavailable");
          else {
            const existing = await this.repos.site.loadBySubDomain(site.subDomain);
            if (existing && existing.id !== site.id) errors.push("Subdomain unavailable");
          }
        }
      }
      if (errors.length > 0) return this.json({ errors }, 400);
      const promises: Promise<Site>[] = sites.map((s) => this.repos.site.save(s));
      const result = await Promise.all(promises);
      return this.repos.site.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const site = await this.repos.site.load(au.churchId, id);
      if (!site) return {};
      await getContentModuleGateway().deleteSiteContent(au.churchId, id);
      await this.repos.domain.clearSiteId(au.churchId, id);
      await this.repos.site.delete(au.churchId, id);
      try {
        await CaddyHelper.updateCaddy();
      } catch (e) {
        console.error("Caddy route sync failed (non-fatal):", e);
      }
      return {};
    });
  }
}
