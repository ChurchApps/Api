import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController";
import { Environment } from "../../../shared/helpers/Environment";

@controller("/membership/debug")
export class DebugController extends MembershipBaseController {
  @httpGet("/jwt-config")
  public async getJwtConfig(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const environment = Environment.currentEnvironment || "unknown";
      const parameterPath = `/${environment.toLowerCase()}/jwtSecret`;

      return {
        jwtSecret: Environment.jwtSecret || "(not set)",
        parameterStorePath: parameterPath
      };
    });
  }

}