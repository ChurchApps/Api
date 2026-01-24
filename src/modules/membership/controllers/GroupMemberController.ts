import { controller, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipCrudController } from "./MembershipCrudController.js";
import { Permissions, UserChurchHelper } from "../helpers/index.js";
import { GroupMember } from "../models/index.js";

@controller("/membership/groupmembers")
export class GroupMemberController extends MembershipCrudController {
  protected crudSettings = {
    repoKey: "groupMember",
    permissions: { view: Permissions.groupMembers.view, edit: Permissions.groupMembers.edit },
    routes: ["getById", "delete"] as const
  };
  @httpGet("/my")
  public async getMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return this.repos.groupMember.loadForPerson(au.churchId, au.personId);
    });
  }

  @httpGet("/public/leaders/:churchId/:groupId")
  public async getPublicLeaders(@requestParam("churchId") churchId: string, @requestParam("groupId") groupId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const result = (await this.repos.groupMember.loadLeadersForGroup(churchId, groupId)) as any[];
      return this.repos.groupMember.convertAllToModel(churchId, result);
    });
  }

  @httpGet("/basic/:groupId")
  public async getbasic(@requestParam("groupId") groupId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const result = (await this.repos.groupMember.loadForGroup(au.churchId, groupId)) as any[];
      return this.repos.groupMember.convertAllToBasicModel(au.churchId, result);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      let hasAccess = false;
      if (au.checkAccess(Permissions.groupMembers.view)) hasAccess = true;
      else if (req.query.groupId && au.groupIds && au.groupIds.includes(req.query.groupId.toString())) hasAccess = true;
      else if (req.query.personId && au.personId === req.query.personId.toString()) hasAccess = true;
      if (!hasAccess) return this.json({}, 401);
      else {
        let result = null;
        if (req.query.groupId !== undefined) result = await this.repos.groupMember.loadForGroup(au.churchId, req.query.groupId.toString());
        else if (req.query.groupIds !== undefined) result = await this.repos.groupMember.loadForGroups(au.churchId, req.query.groupIds.toString().split(","));
        else if (req.query.personId !== undefined) result = await this.repos.groupMember.loadForPerson(au.churchId, req.query.personId.toString());
        else result = await this.repos.groupMember.loadAll(au.churchId);
        return this.repos.groupMember.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, GroupMember[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit)) {
        return this.json({ error: "Unauthorized" }, 401);
      }

      const promises: Promise<GroupMember>[] = [];
      req.body.forEach((gm) => {
        gm.churchId = au.churchId;
        promises.push(this.repos.groupMember.save(gm));
      });
      const result = await Promise.all(promises);

      // Create userChurch records for members with matching users
      for (const gm of result) {
        await UserChurchHelper.createForGroupMember(au.churchId, gm.personId);
      }

      return this.repos.groupMember.convertAllToModel(au.churchId, result);
    });
  }

  // Inherit GET /:id and DELETE /:id via crudSettings
}
