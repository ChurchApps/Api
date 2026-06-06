import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Automation } from "../models/index.js";
import { AutomationHelper } from "../helpers/AutomationHelper.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/automations")
export class AutomationController extends DoingBaseController {
  // Internal cron hook that triggers automation execution. It is unauthenticated
  // (no church/user context), so it is gated by a shared secret and fails closed:
  // the caller must send an x-internal-key header matching INTERNAL_API_KEY. If the
  // env var is not configured the endpoint is disabled entirely, never left open.
  @httpGet("/check")
  public async tempCheck(@requestParam("id") _id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const requiredKey = process.env.INTERNAL_API_KEY;
      if (!requiredKey || req.header("x-internal-key") !== requiredKey) return this.json({}, 401);
      await AutomationHelper.checkAll();
      return { success: true };
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.view)) return this.json({}, 401);
      return await this.repos.automation.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async getForAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.view)) return this.json({}, 401);
      return await this.repos.automation.loadAll(au.churchId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Automation[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.admin)) return this.json({}, 401);
      const promises: Promise<Automation>[] = [];
      req.body.forEach((automation) => {
        automation.churchId = au.churchId;
        promises.push(this.repos.automation.save(automation));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.admin)) return this.json({}, 401);
      await this.repos.automation.delete(au.churchId, id);
      return {};
    });
  }
}
