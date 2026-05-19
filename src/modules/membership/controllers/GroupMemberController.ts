import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions, UserChurchHelper } from "../helpers/index.js";
import { GroupMember } from "../models/index.js";
import { BulkGroupMemberRequest } from "../models/requests.js";
import { WebhookDispatcher } from "../../../shared/webhooks/index.js";

@controller("/membership/groupmembers")
export class GroupMemberController extends MembershipBaseController {
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

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.view)) return this.json({}, 401);
      const data = await this.repos.groupMember.load(au.churchId, id);
      return this.repos.groupMember.convertToModel(au.churchId, data);
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
        const isNew = !gm.id;
        promises.push(
          this.repos.groupMember.save(gm).then(async (saved) => {
            if (isNew) await WebhookDispatcher.emit(au.churchId, "group.member.added", saved);
            return saved;
          })
        );
      });
      const result = await Promise.all(promises);

      // Create userChurch records for members with matching users
      for (const gm of result) {
        await UserChurchHelper.createForGroupMember(au.churchId, gm.personId);
      }

      return this.repos.groupMember.convertAllToModel(au.churchId, result);
    });
  }

  @httpPost("/bulk-add")
  public async bulkAdd(req: express.Request<{}, {}, BulkGroupMemberRequest>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({ error: "Unauthorized" }, 401);

      const groupId = req.body?.groupId;
      if (!groupId) return this.json({ error: "groupId is required" }, 400);
      const personIds = Array.isArray(req.body?.personIds) ? Array.from(new Set(req.body.personIds.filter((id) => typeof id === "string").map((id) => id.trim()).filter(Boolean))) : [];
      if (personIds.length === 0) return this.json({ error: "personIds is required" }, 400);

      const existing = (await this.repos.groupMember.loadForGroup(au.churchId, groupId)) as any[];
      const existingPersonIds = new Set(existing.map((gm) => gm.personId));
      const newPersonIds = personIds.filter((id) => !existingPersonIds.has(id));

      const added: GroupMember[] = [];
      for (const personId of newPersonIds) {
        const saved = await this.repos.groupMember.save({ churchId: au.churchId, groupId, personId, leader: false });
        await UserChurchHelper.createForGroupMember(au.churchId, personId);
        await WebhookDispatcher.emit(au.churchId, "group.member.added", saved);
        added.push(saved);
      }

      return this.json({ success: true, addedIds: added.map((gm) => gm.personId), count: added.length });
    });
  }

  @httpPost("/bulk-remove")
  public async bulkRemove(req: express.Request<{}, {}, BulkGroupMemberRequest>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({ error: "Unauthorized" }, 401);

      const groupId = req.body?.groupId;
      if (!groupId) return this.json({ error: "groupId is required" }, 400);
      const personIds = Array.isArray(req.body?.personIds) ? Array.from(new Set(req.body.personIds.filter((id) => typeof id === "string").map((id) => id.trim()).filter(Boolean))) : [];
      if (personIds.length === 0) return this.json({ error: "personIds is required" }, 400);

      const existing = (await this.repos.groupMember.loadForGroup(au.churchId, groupId)) as any[];
      const toRemove = existing.filter((gm) => personIds.indexOf(gm.personId) !== -1);

      await this.repos.groupMember.deleteForGroupAndPeople(au.churchId, groupId, toRemove.map((gm) => gm.personId));
      for (const gm of toRemove) await WebhookDispatcher.emit(au.churchId, "group.member.removed", gm);

      return this.json({ success: true, removedIds: toRemove.map((gm) => gm.personId), count: toRemove.length });
    });
  }

  @httpPost("/self")
  public async joinSelf(req: express.Request<{}, {}, { groupId: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const groupId = req.body?.groupId;
      if (!groupId) return this.json({ error: "groupId required" }, 400);

      const group: any = await this.repos.group.load(au.churchId, groupId);
      if (!group) return this.json({ error: "Group not found" }, 404);

      const policy = group.joinPolicy ?? "open";
      if (policy === "closed") return this.json({ error: "Group is closed to new members" }, 403);
      if (policy === "request") return this.json({ redirect: "request", error: "This group requires approval" }, 409);

      const existing = (await this.repos.groupMember.loadForPerson(au.churchId, au.personId)) as any[];
      const already = existing.find((m: any) => m.groupId === groupId);
      if (already) return this.repos.groupMember.convertToModel(au.churchId, already);

      const member: GroupMember = { churchId: au.churchId, groupId, personId: au.personId, leader: false };
      const saved = await this.repos.groupMember.save(member);
      await UserChurchHelper.createForGroupMember(au.churchId, saved.personId);
      await WebhookDispatcher.emit(au.churchId, "group.member.added", saved);
      return this.repos.groupMember.convertToModel(au.churchId, saved);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({}, 401);
      const existing = await this.repos.groupMember.load(au.churchId, id);
      await this.repos.groupMember.delete(au.churchId, id);
      await WebhookDispatcher.emit(au.churchId, "group.member.removed", existing ?? { id, churchId: au.churchId });
      return {};
    });
  }
}
