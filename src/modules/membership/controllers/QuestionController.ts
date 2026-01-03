import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Question } from "../models/index.js";

@controller("/membership/questions")
export class QuestionController extends MembershipBaseController {
  @httpGet("/sort/:id/up")
  public async moveQuestionUp(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.question.moveQuestionUp(id);
    });
  }

  @httpGet("/sort/:id/down")
  public async moveQuestionDown(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.question.moveQuestionDown(id);
    });
  }

  @httpGet("/unrestricted")
  public async getUnrestricted(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const formId = req?.query?.formId?.toString() || null;
      if (!formId) return this.json({}, 401);
      else return this.repos.question.convertAllToModel("", (await this.repos.question.loadForUnrestrictedForm(formId)) as any[]);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const formId = req?.query?.formId?.toString() || null;
      if (!this.formAccess(au, formId, "view")) return this.json({}, 401);
      else return this.repos.question.convertToModel(au.churchId, await this.repos.question.load(au.churchId, id));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const formId = req?.query?.formId?.toString() || null;
      if (!this.formAccess(au, formId, "view")) return this.json({}, 401);
      else return this.repos.question.convertAllToModel(au.churchId, (await this.repos.question.loadForForm(au.churchId, formId)) as any[]);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Question[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Question>[] = [];
      const questions = req.body;
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        if (this.formAccess(au, question.formId)) {
          const availableQuestions = (await this.repos.question.loadForForm(au.churchId, question.formId)) as any[];
          const maxValue = Math.max(...(availableQuestions as any[]).map((q: any) => q.sort));
          const addBy = i + 1;
          const sort = availableQuestions.length > 0 ? maxValue + addBy : 1;
          question.churchId = au.churchId;
          question.sort = question.sort ? question.sort : sort.toString();
          promises.push(this.repos.question.save(question));
        }
      }
      const result = await Promise.all(promises);
      return this.repos.question.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const formId = req?.query?.formId?.toString() || null;
      if (!this.formAccess(au, formId)) return this.json({}, 401);
      else {
        await this.repos.question.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
