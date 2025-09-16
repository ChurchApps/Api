import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController";
import { MemberPermission } from "../models";

@controller("/membership/memberpermissions")
export class MemberPermissionController extends MembershipBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.formAccess(au, id, "view")) return this.json({}, 401);
      else return this.repos.memberPermission.convertToModel(au.churchId, await this.repos.memberPermission.load(au.churchId, id));
    });
  }

  @httpGet("/member/:id")
  public async getByMember(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.formAccess(au, id)) return this.json({}, 401);
      else return this.repos.memberPermission.convertAllToModel(au.churchId, (await this.repos.memberPermission.loadFormsByPerson(au.churchId, id)) as any[]);
    });
  }

  @httpGet("/form/:id")
  public async getByForm(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.formAccess(au, id)) return this.json({}, 401);
      else return this.repos.memberPermission.convertAllToModel(au.churchId, (await this.repos.memberPermission.loadPeopleByForm(au.churchId, id)) as any[]);
    });
  }

  @httpGet("/form/:id/my")
  public async getMyPermissions(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.formAccess(au, id)) return this.json({}, 401);
      else {
        const permission = await this.repos.memberPermission.loadMyByForm(au.churchId, id, au.personId);
        return permission ? this.repos.memberPermission.convertToModel(au.churchId, permission) : null;
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, MemberPermission[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<MemberPermission>[] = [];
      req.body.forEach((memberPermission: MemberPermission) => {
        if (this.formAccess(au, memberPermission.contentId)) {
          memberPermission.churchId = au.churchId;
          promises.push(this.repos.memberPermission.save(memberPermission));
        }
      });
      const result = await Promise.all(promises);
      return this.repos.memberPermission.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const formId = req?.query?.formId.toString();
      if (!this.formAccess(au, formId)) return this.json({}, 401);
      else {
        await this.repos.memberPermission.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  @httpDelete("/member/:id")
  public async deleteByMemberId(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const formId = req?.query?.formId.toString();
      if (!formId || !this.formAccess(au, formId)) return this.json({}, 401);
      else {
        await this.repos.memberPermission.deleteByMemberId(au.churchId, id, formId);
        return this.json({});
      }
    });
  }
}
