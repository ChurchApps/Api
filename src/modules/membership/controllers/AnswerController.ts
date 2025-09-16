import { controller, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController";
import { Permissions } from "../helpers";
import { Answer } from "../models";

@controller("/membership/answers")
export class AnswerController extends MembershipBaseController {
  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.forms.admin) || !au.checkAccess(Permissions.forms.edit)) return this.json({}, 401);
      else {
        let data = null;
        if (req.query.formSubmissionId !== undefined) data = this.repos.answer.loadForFormSubmission(au.churchId, req.query.formSubmissionId.toString());
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
        let { churchId } = answer;

        if (!churchId && answer.questionId) {
          // Look up question to get formId
          const question = await this.repos.question.load(au.churchId || "", answer.questionId);
          if (question && question.formId) {
            // Look up form to get churchId
            const formAccess = await this.repos.form.access(question.formId);
            if (formAccess) {
              churchId = formAccess.churchId;
            }
          }
        }

        // Fall back to authenticated user's churchId if still blank
        if (!churchId && au) {
          churchId = au.churchId;
        }

        if (churchId) {
          answer.churchId = churchId;
          const savedAnswer = await this.repos.answer.save(answer);
          results.push(this.repos.answer.convertToModel(churchId, savedAnswer));
        } else {
          results.push({ error: `Unable to determine churchId for answer with questionId ${answer.questionId}` });
        }
      }

      return results;
    });
  }
}
