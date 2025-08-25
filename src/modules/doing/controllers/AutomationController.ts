import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController";
import { Automation } from "../models";
import { AutomationHelper } from "../helpers/AutomationHelper";

@controller("/doing/automations")
export class AutomationController extends DoingBaseController {
  @httpGet("/check")
  public async tempCheck(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      await AutomationHelper.checkAll();
      return { success: true };
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.automation.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async getForAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.automation.loadAll(au.churchId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Automation[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Automation>[] = [];
      req.body.forEach((automation) => {
        automation.churchId = au.churchId;
        promises.push(this.repositories.automation.save(automation));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.automation.delete(au.churchId, id);
      return {};
    });
  }
}
