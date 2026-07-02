import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { FormSubmission, Answer, Form, Church } from "../models/index.js";
import { Permissions, Environment, ConversationalFormHelper } from "../helpers/index.js";
import type { FormContact } from "../helpers/index.js";
import { MemberPermission, Person } from "../models/index.js";
import { WebhookDispatcher } from "../../../shared/webhooks/index.js";
import { TransactionalEmailHelper } from "../../../shared/helpers/TransactionalEmailHelper.js";
import axios from "axios";

@controller("/membership/formsubmissions")
export class FormSubmissionController extends MembershipBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.forms.admin) && !au.checkAccess(Permissions.forms.edit)) return this.json({}, 401);
      const result: FormSubmission = this.repos.formSubmission.convertToModel(au.churchId, await this.repos.formSubmission.load(au.churchId, id));
      if (this.include(req, "form")) await this.appendForm(au.churchId, result);
      if (this.include(req, "questions")) await this.appendQuestions(au.churchId, result);
      if (this.include(req, "answers")) await this.appendAnswers(au.churchId, result);
      return result;
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.forms.admin) && !au.checkAccess(Permissions.forms.edit)) return this.json({}, 401);
      else {
        let result = null;
        if (req.query.personId !== undefined) result = await this.repos.formSubmission.loadForContent(au.churchId, "person", req.query.personId.toString());
        else if (req.query.formId !== undefined) result = await this.repos.formSubmission.loadByFormId(au.churchId, req.query.formId.toString());
        else result = await this.repos.formSubmission.loadAll(au.churchId);
        return this.repos.formSubmission.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpGet("/formId/:formId")
  public async getByFormId(@requestParam("formId") formId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.formAccess(au, formId)) return this.json([], 401);
      else {
        const formSubmissions = await this.repos.formSubmission.convertAllToModel(au.churchId, (await this.repos.formSubmission.loadByFormId(au.churchId, formId)) as any[]);
        console.log("Form Submissions", formSubmissions.length);
        const promises: Promise<FormSubmission>[] = [];
        formSubmissions.forEach((formSubmission: FormSubmission) => {
          promises.push(this.appendForm(au.churchId, formSubmission));
          promises.push(this.appendQuestions(au.churchId, formSubmission));
          promises.push(this.appendAnswers(au.churchId, formSubmission));
        });
        await Promise.all(promises);
        return formSubmissions;
      }
    });
  }

  // authz-exempt: open form submission — public forms accept any submitter; restricted forms gated by this.formAccess(au, formId), churchId derived from the loaded form not the request
  @httpPost("/")
  public async save(req: express.Request<{}, {}, FormSubmission[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (req.body?.length > 0) {
        const results: any[] = [];
        for (const formSubmission of req.body) {
          const { formId } = formSubmission;
          let { churchId } = formSubmission;

          const formAccess = await this.repos.form.access(formId);
          const form = formAccess && this.repos.form.convertToModel(formAccess.churchId, formAccess);

          if (!form) {
            results.push({ error: `Form with id ${formId} not found` });
          } else {
            if (!churchId) churchId = form.churchId;
            if (!churchId && au) churchId = au.churchId;
            if (form.restricted && !(await this.formAccess(au, formId))) {
              results.push({ error: `You're not allowed to submit ${form.name}` });
            } else {
              formSubmission.churchId = churchId;

              const wantsPerson = form.autoCreatePerson === true;
              const wantsFollowUp = !!(form.followUpSubject && form.followUpBody);
              let contact: FormContact = null;
              let followUpFirstName: string = null;
              if (wantsPerson || wantsFollowUp) {
                const questions = this.repos.question.convertAllToModel(churchId, (await this.repos.question.loadForForm(churchId, formId)) as any[]);
                contact = ConversationalFormHelper.extractContact(questions, formSubmission.answers || []);
                followUpFirstName = contact?.firstName;
                if (wantsPerson && contact?.email && !formSubmission.contentId) {
                  const person = await ConversationalFormHelper.findOrCreatePerson(this.repos, churchId, contact);
                  if (person) {
                    formSubmission.contentType = "person";
                    formSubmission.contentId = person.id;
                    followUpFirstName = person.name?.first || contact.firstName;
                  }
                }
              }

              const savedSubmissions = await this.repos.formSubmission.save(formSubmission);

              const answerPromises: Promise<Answer>[] = [];
              formSubmission?.answers?.forEach((answer) => {
                if (!answer.churchId) answer.churchId = churchId;
                answer.formSubmissionId = savedSubmissions.id;
                answerPromises.push(this.repos.answer.save(answer));
              });
              if (answerPromises.length > 0) {
                await Promise.all(answerPromises);
              }

              results.push(savedSubmissions);
              // Submitters land in workflows via the unified trigger engine, which
              // subscribes to this event (form.submission.created) on the internal bus.
              await WebhookDispatcher.emit(churchId, "form.submission.created", savedSubmissions);

              try {
                await this.sendEmails(formSubmission, form, churchId);
              } catch (err) {
                console.error("Form submission notifications failed (non-fatal):", err);
              }

              if (wantsFollowUp && contact?.email) {
                try {
                  await this.sendFollowUp(churchId, contact.email, followUpFirstName, form.followUpSubject, form.followUpBody);
                } catch (err) {
                  console.error("Form follow-up email failed (non-fatal):", err);
                }
              }
            }
          }
        }

        return results;
      }

      return { error: "Please check body. formsubmissions is required" };
    });
  }

  private async sendEmails(formSubmission: FormSubmission, form: Form, churchId: string) {
    // send email to form members that have emailNotification set to true
    const memberPermissions = (await this.repos.memberPermission.loadByEmailNotification(churchId, "form", form.id, true)) as any;
    const church: Church = await this.repos.church.loadById(churchId);
    if ((memberPermissions as any[])?.length > 0) {
      const ids = (memberPermissions as any[]).map((mp: MemberPermission) => mp.memberId);
      if (ids?.length > 0) {
        const people = (await this.repos.person.loadByIds(formSubmission.churchId, ids)) as any[];
        if ((people as any[])?.length > 0) {
          const contentRows: any[] = [];
          formSubmission.questions.forEach((q) => {
            formSubmission.answers.forEach((a) => {
              if (q.id === a.questionId) {
                contentRows.push("<tr><th style=\"font-size: 16px\" width=\"30%\">" + q.title + "</th><td style=\"font-size: 15px\">" + a.value + "</td></tr>");
              }
            });
          });

          const contents = "<table role=\"presentation\" style=\"text-align: left;\" cellspacing=\"8\" width=\"80%\"><tablebody>" + contentRows.join(" ") + "</tablebody></table>";
          const promises: Promise<any>[] = [];
          (people as any[]).forEach((p: Person) => {
            if (p.email) promises.push(TransactionalEmailHelper.sendTransactional(Environment.supportEmail, p.email, church.name, Environment.b1AdminRoot, "New Submissions for " + form.name, contents));
          });
          promises.push(this.sendNotifications(churchId, form, ids));
          await Promise.all(promises);
        }
      }
    }
  }

  private async sendFollowUp(churchId: string, email: string, firstName: string, subject: string, body: string) {
    const church: Church = await this.repos.church.loadById(churchId);
    const tokens = { firstName, churchName: church?.name };
    const resolvedSubject = ConversationalFormHelper.applyTokens(subject, tokens);
    const resolvedBody = ConversationalFormHelper.applyTokens(body, tokens);
    await TransactionalEmailHelper.sendTransactional(Environment.supportEmail, email, church?.name, Environment.b1AdminRoot, resolvedSubject, resolvedBody, "ChurchEmailTemplate.html");
  }

  private async sendNotifications(churchId: string, form: Form, peopleIds: string[]) {
    const data = {
      churchId,
      peopleIds,
      contentType: "form",
      contentId: form.id,
      message: "New Form Submission: " + form.name
    };
    // todo add some kind of auth token and check for it. Can't be jwt since submissions can be anonymous.  Need to encrypt something
    // const config:AxiosRequestConfig = { headers: { "Authorization": "Bearer " + au.jwt } };
    return axios.post(Environment.messagingApi + "/notifications/ping", data);
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.forms.admin) && !au.checkAccess(Permissions.forms.edit)) return this.json({}, 401);
      else {
        await this.repos.answer.deleteForSubmission(au.churchId, id);
        await new Promise((resolve) => setTimeout(resolve, 500)); // I think it takes a split second for the FK restraints to see the answers were deleted sometimes and the delete below fails.
        await this.repos.formSubmission.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  private async appendForm(churchId: string, formSubmission: FormSubmission) {
    const data = await this.repos.form.load(churchId, formSubmission.formId);
    formSubmission.form = this.repos.form.convertToModel(churchId, data);
    return formSubmission;
  }

  private async appendQuestions(churchId: string, formSubmission: FormSubmission) {
    const data = (await this.repos.question.loadForForm(churchId, formSubmission.formId)) as any[];
    formSubmission.questions = this.repos.question.convertAllToModel(churchId, data);
    return formSubmission;
  }

  private async appendAnswers(churchId: string, formSubmission: FormSubmission) {
    const data = (await this.repos.answer.loadForFormSubmission(churchId, formSubmission.id)) as any[];
    formSubmission.answers = this.repos.answer.convertAllToModel(churchId, data);
    return formSubmission;
  }
}
