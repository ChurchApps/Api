import { controller, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { Answer } from "../models/index.js";

@controller("/membership/answers")
export class AnswerController extends MembershipBaseController {
  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.forms.admin) && !au.checkAccess(Permissions.forms.edit)) return this.json({}, 401);
      else {
        let data: any = null;
        if (req.query.formSubmissionId !== undefined) data = await this.repos.answer.loadForFormSubmission(au.churchId, req.query.formSubmissionId.toString());
        else data = await this.repos.answer.loadAll(au.churchId);
        return this.repos.answer.convertAllToModel(au.churchId, data);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Answer[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.forms.admin) && !au.checkAccess(Permissions.forms.edit)) return this.json({}, 401);

      const results: any[] = [];
      for (const answer of req.body) {
        answer.churchId = au.churchId;
        const savedAnswer = await this.repos.answer.save(answer);
        results.push(this.repos.answer.convertToModel(au.churchId, savedAnswer));
      }

      return results;
    });
  }
}
