import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { Notification } from "../models/index.js";
import { NotificationHelper } from "../helpers/NotificationHelper.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";

@controller("/messaging/notifications")
export class NotificationController extends MessagingBaseController {
  @httpGet("/groupPreview/:groupId")
  public async previewGroupPush(@requestParam("groupId") groupId: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!(await this.canSendGroupPush(au))) return this.json({ error: "Unauthorized" }, 401);

      const preview = await NotificationHelper.getGroupPushPreview(au.churchId, groupId, au.personId);
      const { eligiblePersonIds: _eligiblePersonIds, ...result } = preview;
      return result;
    }) as any;
  }

  @httpGet("/:churchId/person/:personId")
  public async loadByPerson(
    @requestParam("churchId") _churchId: string,
    @requestParam("personId") personId: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<Notification[]> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.notification.loadByPersonId(au.churchId, personId);
      return this.repos.notification.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/:id")
  public async loadById(@requestParam("churchId") _churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Notification> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.notification.loadById(au.churchId, id);
      return this.repos.notification.convertToModel(data);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Notification[]>, res: express.Response): Promise<Notification[]> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Notification>[] = [];
      req.body.forEach((notification) => {
        notification.churchId = au.churchId;
        promises.push(this.repos.notification.save(notification));
      }) as any;
      const result = await Promise.all(promises);
      return this.repos.notification.convertAllToModel(result as any[]);
    }) as any;
  }

  @httpPost("/markRead/:churchId/:personId")
  public async markRead(@requestParam("churchId") _churchId: string, @requestParam("personId") personId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.notification.markRead(au.churchId, personId);
    }) as any;
  }

  @httpPost("/sendTest")
  public async sendTestNotification(req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { personId, title } = req.body;
      const method = await NotificationHelper.notifyUser(au.churchId, personId, title || "Test Notification");
      return { method, success: true };
    }) as any;
  }

  @httpGet("/unreadCount")
  public async loadMyUnread(req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const existing = await this.repos.notification.loadNewCounts(au.churchId, au.personId);
      return existing || {};
    }) as any;
  }

  @httpGet("/my")
  public async loadMy(req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const existing = await this.repos.notification.loadForPerson(au.churchId, au.personId);
      await this.repos.notification.markAllRead(au.churchId, au.personId);
      return existing || {};
    }) as any;
  }

  @httpPost("/create")
  public async create(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      return await NotificationHelper.createNotifications(req.body.peopleIds, au.churchId, req.body.contentType, req.body.contentId, req.body.message, req.body?.link, au.personId);
    }) as any;
  }

  @httpPost("/group/send")
  public async sendGroupPush(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!(await this.canSendGroupPush(au))) return this.json({ error: "Unauthorized" }, 401);

      const groupId = (req.body?.groupId || "").trim();
      const title = (req.body?.title || "").trim();
      const message = (req.body?.message || "").trim();
      const link = (req.body?.link || "").trim();
      const imageUrl = (req.body?.imageUrl || "").trim();

      if (!groupId || !title || !message) return this.json({ error: "groupId, title, and message are required" }, 400);

      const scheduledTime = req.body?.scheduledTime ? new Date(req.body.scheduledTime) : null;
      if (scheduledTime && !isNaN(scheduledTime.getTime()) && scheduledTime.getTime() > Date.now()) {
        const saved = await this.repos.scheduledNotification.save({ churchId: au.churchId, groupId, title, message, link, imageUrl, senderPersonId: au.personId, scheduledTime });
        return { scheduled: true, scheduledTime: scheduledTime.toISOString(), id: saved.id };
      }

      const result = await NotificationHelper.sendGroupPush(au.churchId, groupId, title, message, link, imageUrl, au.personId);
      if (result.recipientCount === 0) return this.json({ error: "No group members have PWA push enabled on this device set." }, 400);
      return result;
    }) as any;
  }

  @httpPost("/ping")
  public async ping(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => {
      return await NotificationHelper.createNotifications([req.body.personId], req.body.churchId, req.body.contentType, req.body.contentId, req.body.message, undefined, req.body.triggeredByPersonId);
    }) as any;
  }

  @httpGet("/tmpEmail")
  public async tmpEmail(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => {
      console.log("[tmpEmail] Endpoint called, initializing NotificationHelper...");
      NotificationHelper.init(this.repos);
      console.log("[tmpEmail] Calling sendEmailNotifications('daily')...");
      const result = await NotificationHelper.sendEmailNotifications("daily");
      console.log("[tmpEmail] Complete, result:", JSON.stringify(result));
      return result;
    }) as any;
  }

  /*
  @httpGet("/tmp15Min")
  public async tmp15Min(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => {
      console.log("[tmp15Min] Endpoint called, initializing NotificationHelper...");
      NotificationHelper.init(this.repos);

      console.log("[tmp15Min] Step 1: Escalating unread notifications...");
      const escalationResult = await NotificationHelper.escalateDelivery();
      console.log("[tmp15Min] escalateDelivery result:", JSON.stringify(escalationResult));

      console.log("[tmp15Min] Step 2: Processing individual email notifications...");
      const emailResult = await NotificationHelper.sendEmailNotifications("individual");
      console.log("[tmp15Min] sendEmailNotifications result:", JSON.stringify(emailResult));

      return { escalationResult, emailResult };
    }) as any;
  }*/

  @httpDelete("/my")
  public async deleteMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.notification.deleteAllForPerson(au.churchId, au.personId);
    }) as any;
  }

  @httpDelete("/:churchId/:id")
  public async delete(@requestParam("churchId") _churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.notification.delete(au.churchId, id);
    }) as any;
  }

  private async canSendGroupPush(au: any): Promise<boolean> {
    if (au.checkAccess(Permissions.groupMembers.edit)) return true;
    if (!au.id || !au.churchId) return false;

    const membershipRepos = await RepoManager.getRepos<any>("membership");
    const userChurch = await membershipRepos.rolePermission.loadUserPermissionInChurch(au.id, au.churchId);
    const membershipApi = userChurch?.apis?.find((api: any) => api.keyName === "MembershipApi");

    return !!membershipApi?.permissions?.some((permission: any) => {
      if (permission.contentType === "Domain" && permission.action === "Admin") return true;
      return permission.contentType === Permissions.groupMembers.edit.contentType && permission.action === Permissions.groupMembers.edit.action;
    });
  }
}
