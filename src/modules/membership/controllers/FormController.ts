import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController";
import { Form, MemberPermission } from "../models";
import { Permissions } from "../helpers";

@controller("/membership/forms")
export class FormController extends MembershipBaseController {
  @httpGet("/archived")
  public async getArchived(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (au.checkAccess(Permissions.forms.admin)) return this.repos.form.convertAllToModel(au.churchId, (await this.repos.form.loadAllArchived(au.churchId)) as any[]);
      else {
        const memberForms = await this.repos.form.convertAllToModel(au.churchId, (await this.repos.form.loadMemberArchivedForms(au.churchId, au.personId)) as any[]);
        const nonMemberForms = au.checkAccess(Permissions.forms.edit)
          ? await this.repos.form.convertAllToModel(au.churchId, (await this.repos.form.loadNonMemberArchivedForms(au.churchId)) as any[])
          : [];
        return [...memberForms, ...nonMemberForms];
      }
    });
  }

  @httpGet("/standalone/:id")
  public async getStandAlone(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const churchId = req?.query?.churchId.toString();
      const form = this.repos.form.convertToModel("", await this.repos.form.load(churchId, id));
      if (form.contentType !== "form" || (!au.id && form.restricted)) return this.json({ restricted: true }, 401);
      else return form;
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.formAccess(au, id, "view")) return this.json({}, 401);
      else return await this.repos.form.convertToModel(au.churchId, await this.repos.form.load(au.churchId, id));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (au.checkAccess(Permissions.forms.admin)) return await this.repos.form.convertAllToModel(au.churchId, (await this.repos.form.loadAll(au.churchId)) as any[]);
      else {
        const memberForms = await this.repos.form.convertAllToModel(au.churchId, (await this.repos.form.loadMemberForms(au.churchId, au.personId)) as any[]);
        const nonMemberForms = au.checkAccess(Permissions.forms.edit) ? await this.repos.form.convertAllToModel(au.churchId, (await this.repos.form.loadNonMemberForms(au.churchId)) as any[]) : [];
        return [...memberForms, ...nonMemberForms];
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Form[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const formPromises: Promise<Form>[] = [];
      const newStandAloneFormPromises: Promise<Form>[] = [];
      const memberPermissionPromises: Promise<MemberPermission>[] = [];
      if (req.body.length === 0) return res.status(400).send("Request body cannot be empty array!");
      req.body.forEach((form) => {
        if ((!form.id && (Permissions.forms.admin || Permissions.forms.edit)) || (form.id && this.formAccess(au, form.id))) {
          form.churchId = au.churchId;
          if (!form.id && form.contentType === "form") newStandAloneFormPromises.push(this.repos.form.save(form));
          else formPromises.push(this.repos.form.save(form));
        }
      });
      const formResult = await this.repos.form.convertAllToModel(au.churchId, await Promise.all(formPromises));
      const newStandAloneFormResult = await this.repos.form.convertAllToModel(au.churchId, await Promise.all(newStandAloneFormPromises));
      newStandAloneFormResult.forEach((form) => {
        const memberPermission = {
          churchId: au.churchId,
          memberId: au.personId,
          contentType: form.contentType,
          contentId: form.id,
          action: "admin"
        };
        memberPermissionPromises.push(this.repos.memberPermission.save(memberPermission));
      });
      await Promise.all(memberPermissionPromises);
      return [...formResult, newStandAloneFormResult];
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.formAccess(au, id)) return this.json({}, 401);
      else {
        await this.repos.form.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
