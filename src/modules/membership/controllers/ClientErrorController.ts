import { controller, httpPost } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";

@controller("/membership/clientErrors")
export class ClientErrorController extends MembershipBaseController {
  @httpPost("/")
  public async save(req: express.Request<{}, {}, any[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<any>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.clientError.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.clientError.convertAllToModel(au.churchId, result);
    });
  }
}
