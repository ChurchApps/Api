import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { Device, Notification, NotificationPreference } from "../models/index.js";
import { NotificationHelper } from "../helpers/NotificationHelper.js";
import { WebPushHelper } from "../helpers/WebPushHelper.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";

interface GroupMemberDetail {
  personId: string;
  displayName: string;
}

interface GroupPushPreview {
  totalMembers: number;
  eligibleCount: number;
  noDeviceCount: number;
  pushDisabledCount: number;
  excludedSenderCount: number;
  webPushDeviceCount: number;
  eligiblePersonIds: string[];
}

@controller("/messaging/notifications")
export class NotificationController extends MessagingBaseController {
  @httpGet("/groupPreview/:groupId")
  public async previewGroupPush(@requestParam("groupId") groupId: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!(await this.canSendGroupPush(au))) return this.json({ error: "Unauthorized" }, 401);

      const preview = await this.getGroupPushPreview(au.churchId, groupId, au.personId);
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
      return this.repos.notification.convertToModel(data);
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
      if (!(await this.canSendGroupPush(au))) return this.json({ error: "Unauthorized" }, 401);

      const groupId = (req.body?.groupId || "").trim();
      const title = (req.body?.title || "").trim();
      const message = (req.body?.message || "").trim();
      const link = (req.body?.link || "").trim();
      const imageUrl = (req.body?.imageUrl || "").trim();

      if (!groupId || !title || !message) return this.json({ error: "groupId, title, and message are required" }, 400);

      const preview = await this.getGroupPushPreview(au.churchId, groupId, au.personId);
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

  private async getGroupMemberDetails(churchId: string, groupId: string): Promise<GroupMemberDetail[]> {
    const membershipRepos = await RepoManager.getRepos<any>("membership");
    const members: any[] = await membershipRepos.groupMember.loadForGroup(churchId, groupId);
    return members
      .filter((m) => !!m.personId)
      .map((m) => ({
        personId: m.personId,
        displayName: m.person?.name?.display || m.displayName || ""
      }));
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

  private prefAllowsPush(pref: NotificationPreference | undefined): boolean {
    if (!pref) return true;
    const value = pref.allowPush as any;
    if (Buffer.isBuffer(value)) return value[0] !== 0;
    return value !== false && value !== 0 && value !== "0";
  }

  private async getGroupPushPreview(churchId: string, groupId: string, senderPersonId: string): Promise<GroupPushPreview> {
    const members = await this.getGroupMemberDetails(churchId, groupId);
    const memberPersonIds = [...new Set(members.map((m) => m.personId).filter(Boolean))];
    const senderIsMember = memberPersonIds.includes(senderPersonId);
    const candidatePersonIds = memberPersonIds.filter((id) => id !== senderPersonId);
    const candidateSet = new Set(candidatePersonIds);

    const devices: Device[] = (await this.repos.device.loadByChurchId(churchId)) as any[];
    const webPushDevices = devices.filter((device) => {
      return !!device.personId && candidateSet.has(device.personId) && WebPushHelper.isWebPushToken(device.fcmToken);
    });
    const peopleWithWebPush = new Set(webPushDevices.map((device) => device.personId));

    const prefs: NotificationPreference[] = (await this.repos.notificationPreference.loadByPersonIds(candidatePersonIds)) as any[];
    const prefByPersonId = new Map<string, NotificationPreference>();
    prefs
      .filter((pref) => pref.churchId === churchId)
      .forEach((pref) => prefByPersonId.set(pref.personId, pref));

    const eligiblePersonIds = candidatePersonIds.filter((personId) => {
      return peopleWithWebPush.has(personId) && this.prefAllowsPush(prefByPersonId.get(personId));
    });

    const pushDisabledCount = candidatePersonIds.filter((personId) => {
      return peopleWithWebPush.has(personId) && !this.prefAllowsPush(prefByPersonId.get(personId));
    }).length;

    return {
      totalMembers: memberPersonIds.length,
      eligibleCount: eligiblePersonIds.length,
      noDeviceCount: candidatePersonIds.filter((personId) => !peopleWithWebPush.has(personId)).length,
      pushDisabledCount,
      excludedSenderCount: senderIsMember ? 1 : 0,
      webPushDeviceCount: webPushDevices.length,
      eligiblePersonIds
    };
  }
}
