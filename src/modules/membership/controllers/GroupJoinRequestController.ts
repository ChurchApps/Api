import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions, UserChurchHelper } from "../helpers/index.js";
import { GroupJoinRequest, GroupMember } from "../models/index.js";
import { NotificationHelper } from "../../messaging/helpers/NotificationHelper.js";

@controller("/membership/groupjoinrequests")
export class GroupJoinRequestController extends MembershipBaseController {
  @httpGet("/my")
  public async getMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.groupJoinRequest.loadForPerson(au.churchId, au.personId);
      return this.repos.groupJoinRequest.convertAllToModel(au.churchId, data);
    });
  }

  @httpGet("/group/:groupId")
  public async getForGroup(@requestParam("groupId") groupId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const isLeader = au.groupIds && au.groupIds.includes(groupId);
      if (!au.checkAccess(Permissions.groupMembers.edit) && !isLeader) return this.json({}, 401);
      const data = await this.repos.groupJoinRequest.loadPendingForGroup(au.churchId, groupId);
      return this.repos.groupJoinRequest.convertAllToModel(au.churchId, data);
    });
  }

  @httpGet("/pending")
  public async getPending(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({}, 401);
      const data = await this.repos.groupJoinRequest.loadPendingForChurch(au.churchId);
      return this.repos.groupJoinRequest.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, { groupId: string; message?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { groupId, message } = req.body || ({} as any);
      if (!groupId) return this.json({ error: "groupId required" }, 400);

      const group: any = await this.repos.group.load(au.churchId, groupId);
      if (!group) return this.json({ error: "Group not found" }, 404);
      if (group.joinPolicy !== "request") return this.json({ error: "Group does not accept join requests" }, 400);

      const existingMembers = await this.repos.groupMember.loadForPerson(au.churchId, au.personId) as any[];
      if (existingMembers.some((m: any) => m.groupId === groupId)) return this.json({ error: "Already a member" }, 409);

      const existingPending = await this.repos.groupJoinRequest.loadExistingPending(au.churchId, groupId, au.personId);
      if (existingPending) return this.repos.groupJoinRequest.convertToModel(au.churchId, existingPending);

      const request: GroupJoinRequest = {
        churchId: au.churchId,
        groupId,
        personId: au.personId,
        message: message?.slice(0, 1000),
        status: "pending"
      };
      const saved = await this.repos.groupJoinRequest.save(request);

      try {
        const leaders = (await this.repos.groupMember.loadLeadersForGroup(au.churchId, groupId)) as any[];
        const leaderIds = leaders.map((l: any) => l.personId).filter(Boolean);
        if (leaderIds.length) {
          const requesterDisplay = (await this.repos.person.load(au.churchId, au.personId) as any)?.displayName || "Someone";
          await NotificationHelper.createNotifications(
            leaderIds,
            au.churchId,
            "groupJoinRequest",
            saved.id,
            `${requesterDisplay} requested to join ${group.name}`,
            `/groups/${groupId}`,
            au.personId
          );
        }
      } catch (e) {
        console.error("Failed to send join-request notifications:", e);
      }

      return saved;
    });
  }

  @httpPost("/:id/approve")
  public async approve(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const request: any = await this.repos.groupJoinRequest.load(au.churchId, id);
      if (!request) return this.json({}, 404);
      if (request.status !== "pending") return this.json({ error: "Request not pending" }, 400);

      const isLeader = au.groupIds && au.groupIds.includes(request.groupId);
      if (!au.checkAccess(Permissions.groupMembers.edit) && !isLeader) return this.json({}, 401);

      const member: GroupMember = {
        churchId: au.churchId,
        groupId: request.groupId,
        personId: request.personId,
        leader: false
      };
      await this.repos.groupMember.save(member);
      await UserChurchHelper.createForGroupMember(au.churchId, member.personId);

      request.status = "approved";
      request.decidedBy = au.personId;
      request.decidedDate = new Date();
      await this.repos.groupJoinRequest.save(request);

      try {
        const group: any = await this.repos.group.load(au.churchId, request.groupId);
        await NotificationHelper.createNotifications(
          [request.personId],
          au.churchId,
          "groupJoinRequest",
          request.id,
          `Your request to join ${group?.name ?? "the group"} was approved`,
          `/mobile/groups/${request.groupId}`,
          au.personId
        );
      } catch (e) {
        console.error("Failed to send approval notification:", e);
      }

      return this.repos.groupJoinRequest.convertToModel(au.churchId, request);
    });
  }

  @httpPost("/:id/decline")
  public async decline(@requestParam("id") id: string, req: express.Request<{}, {}, { declineReason?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const request: any = await this.repos.groupJoinRequest.load(au.churchId, id);
      if (!request) return this.json({}, 404);
      if (request.status !== "pending") return this.json({ error: "Request not pending" }, 400);

      const isLeader = au.groupIds && au.groupIds.includes(request.groupId);
      if (!au.checkAccess(Permissions.groupMembers.edit) && !isLeader) return this.json({}, 401);

      request.status = "declined";
      request.decidedBy = au.personId;
      request.decidedDate = new Date();
      request.declineReason = req.body?.declineReason?.slice(0, 500) ?? null;
      await this.repos.groupJoinRequest.save(request);

      try {
        const group: any = await this.repos.group.load(au.churchId, request.groupId);
        const baseMessage = `Your request to join ${group?.name ?? "the group"} was declined`;
        const fullMessage = request.declineReason ? `${baseMessage}: ${request.declineReason}` : baseMessage;
        await NotificationHelper.createNotifications(
          [request.personId],
          au.churchId,
          "groupJoinRequest",
          request.id,
          fullMessage,
          undefined,
          au.personId
        );
      } catch (e) {
        console.error("Failed to send decline notification:", e);
      }

      return this.repos.groupJoinRequest.convertToModel(au.churchId, request);
    });
  }

  @httpDelete("/:id")
  public async cancel(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const request: any = await this.repos.groupJoinRequest.load(au.churchId, id);
      if (!request) return this.json({}, 404);
      const isOwner = request.personId === au.personId;
      if (!isOwner && !au.checkAccess(Permissions.groupMembers.edit)) return this.json({}, 401);
      if (request.status === "pending") {
        request.status = "cancelled";
        request.decidedBy = au.personId;
        request.decidedDate = new Date();
        await this.repos.groupJoinRequest.save(request);
      }
      return {};
    });
  }
}
