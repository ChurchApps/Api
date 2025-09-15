import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { BridgeBaseController } from "./BridgeBaseController";

@controller("/doing/actions")
export class ActionController extends BridgeBaseController {
  @httpGet("/test")
  public async get(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return [];
    });
  }

}
