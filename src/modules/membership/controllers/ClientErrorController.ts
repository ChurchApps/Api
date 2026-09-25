import { controller, httpPost } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { LoginRateLimiter, PublicPersonRateLimiter } from "../helpers/index.js";

const MAX_ITEMS = 20;

@controller("/membership/clientErrors")
export class ClientErrorController extends MembershipBaseController {
  // authz-exempt: self-service — every record is scoped to au.churchId before save; any caller may log client errors, anonymous callers are rate limited per ip
  @httpPost("/")
  public async save(req: express.Request<{}, {}, any[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!Array.isArray(req.body)) return this.json({}, 400);
      if (!au?.id && !(await PublicPersonRateLimiter.allow(this.repos, LoginRateLimiter.getClientIp(req), "", "clientErrors", 30))) return this.json({}, 429);
      const promises: Promise<any>[] = [];
      req.body.slice(0, MAX_ITEMS).forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.clientError.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.clientError.convertAllToModel(au.churchId, result);
    });
  }
}
