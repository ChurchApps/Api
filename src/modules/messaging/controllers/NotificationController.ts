import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { Notification } from "../models/index.js";
import { NotificationHelper } from "../helpers/NotificationHelper.js";
import { PushAudienceHelper } from "../helpers/PushAudienceHelper.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";

@controller("/messaging/notifications")
export class NotificationController extends MessagingBaseController {
  @httpGet("/groupPreview/:groupId")
  public async previewGroupPush(@requestParam("groupId") groupId: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({ error: "Unauthorized" }, 401);

      const preview = await PushAudienceHelper.getGroupPushPreview(this.repos, au.churchId, groupId, au.personId);
      const { eligiblePersonIds: _eligiblePersonIds, ...result } = preview;
      return result;
    }) as any;
  }

  // Recipient count for the "Everyone with the app" audience (scheduled push, ChurchAppsSupport#1411).
  @httpGet("/churchPreview")
  public async previewChurchPush(req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({ error: "Unauthorized" }, 401);

      const preview = await PushAudienceHelper.getChurchPushPreview(this.repos, au.churchId, au.personId);
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
      if (personId !== au.personId && !au.checkAccess(Permissions.messaging.admin)) return this.json({}, 401);
      const data = await this.repos.notification.loadByPersonId(au.churchId, personId);
      return this.repos.notification.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/:id")
  public async loadById(@requestParam("churchId") _churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Notification> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.notification.loadById(au.churchId, id);
      if (!data) return this.json({}, 404);
      const model = this.repos.notification.convertToModel(data);
      if (model.personId !== au.personId && !au.checkAccess(Permissions.messaging.admin)) return this.json({}, 401);
      return model;
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Notification[]>, res: express.Response): Promise<Notification[]> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.messaging.admin)) return this.json({}, 401);
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
      if (personId !== au.personId && !au.checkAccess(Permissions.messaging.admin)) return this.json({}, 401);
      await this.repos.notification.markRead(au.churchId, personId);
    }) as any;
  }

  @httpPost("/sendTest")
  public async sendTestNotification(req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.messaging.admin)) return this.json({}, 401);
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

  // Called from other modules (e.g. Doing: task assignment, plan publish/notify) after the
  // triggering action already passed its own permission check.
  @httpPost("/create")
  public async create(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.messaging.admin)) return this.json({}, 401);
      return await NotificationHelper.createNotifications(req.body.peopleIds, au.churchId, req.body.contentType, req.body.contentId, req.body.message, req.body?.link, au.personId);
    }) as any;
  }

  @httpPost("/group/send")
  public async sendGroupPush(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({ error: "Unauthorized" }, 401);

      const groupId = (req.body?.groupId || "").trim();
      const title = (req.body?.title || "").trim();
      const message = (req.body?.message || "").trim();
      const link = (req.body?.link || "").trim();
      const imageUrl = (req.body?.imageUrl || "").trim();

      if (!groupId || !title || !message) return this.json({ error: "groupId, title, and message are required" }, 400);

      const preview = await PushAudienceHelper.getGroupPushPreview(this.repos, au.churchId, groupId, au.personId);
      if (preview.eligiblePersonIds.length === 0) return this.json({ error: "No group members have PWA push enabled on this device set." }, 400);

      const contentId = `${groupId}:${Date.now()}`;
      const defaultLink = `/mobile/groups/${groupId}`;
      const notificationLink = link || defaultLink;
      const notifications = await NotificationHelper.createNotifications(
        preview.eligiblePersonIds,
        au.churchId,
        "groupPushNotification",
        contentId,
        message,
        notificationLink,
        au.personId,
        {
          deliveryStartLevel: 1,
          deliveryTitle: title,
          navData: {
            innerType: "group",
            innerId: groupId,
            link: notificationLink,
            ...(imageUrl ? { image: imageUrl } : {})
          }
        }
      );

      const pushCount = notifications.filter((n) => n.deliveryMethod === "push").length;
      const { eligiblePersonIds: _eligiblePersonIds, ...result } = preview;
      return {
        ...result,
        recipientCount: preview.eligiblePersonIds.length,
        successCount: pushCount,
        skippedCount: preview.eligiblePersonIds.length - pushCount
      };
    }) as any;
  }

  @httpPost("/ping")
  public async ping(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.messaging.admin)) return this.json({}, 401);
      return await NotificationHelper.createNotifications([req.body.personId], au.churchId, req.body.contentType, req.body.contentId, req.body.message, undefined, req.body.triggeredByPersonId);
    }) as any;
  }

  // authz-exempt: self-service — deletes only the caller's own notifications, scoped by au.churchId + au.personId from the JWT
  @httpDelete("/my")
  public async deleteMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.notification.deleteAllForPerson(au.churchId, au.personId);
    }) as any;
  }

  @httpDelete("/:churchId/:id")
  public async delete(@requestParam("churchId") _churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      const existing = await this.repos.notification.loadById(au.churchId, id);
      if (existing?.personId !== au.personId && !au.checkAccess(Permissions.messaging.admin)) return this.json({}, 401);
      await this.repos.notification.delete(au.churchId, id);
    }) as any;
  }
}
