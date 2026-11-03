import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { ScheduledNotification } from "../models/index.js";
import { ScheduledNotificationHelper } from "../helpers/ScheduledNotificationHelper.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";

const TITLE_MAX = 80;
const MESSAGE_MAX = 240;
const URL_MAX = 500;
const IMMEDIATE_LEAD_MS = 60 * 1000; // a send time within a minute goes out now

// Scheduled push notifications (ChurchAppsSupport#1411). The everyone audience needs content.edit
// (the people who manage the church's app); a group audience needs groupMembers.edit, as for an immediate group push.
@controller("/messaging/scheduledNotifications")
export class ScheduledNotificationController extends MessagingBaseController {
  @httpGet("/")
  public async loadAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit) && !au.checkAccess(Permissions.content.edit)) return this.json({ error: "Unauthorized" }, 401);
      return await this.repos.scheduledNotification.loadForChurch(au.churchId);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const body = req.body || {};
      const audience = body.audience === "church" ? "church" : body.audience === "group" ? "group" : "";
      const groupId = (body.groupId || "").trim();
      const title = (body.title || "").trim();
      const message = (body.message || "").trim();
      const link = (body.link || "").trim();
      const imageUrl = (body.imageUrl || "").trim();
      const sendAt = new Date(body.sendAt);

      if (!this.canSendTo(au, audience)) return this.json({ error: "Unauthorized" }, 401);
      if (audience === "group" && !groupId) return this.json({ error: "groupId is required for a group audience" }, 400);
      if (!title || !message) return this.json({ error: "title and message are required" }, 400);
      if (title.length > TITLE_MAX || message.length > MESSAGE_MAX) return this.json({ error: `Title is limited to ${TITLE_MAX} characters and message to ${MESSAGE_MAX}` }, 400);
      if (link && !this.validLink(link)) return this.json({ error: "Link must be a site path or an http(s) URL" }, 400);
      if (imageUrl && !this.validUrl(imageUrl)) return this.json({ error: "Image must be an http(s) URL" }, 400);
      if (isNaN(sendAt.getTime())) return this.json({ error: "sendAt must be a date and time" }, 400);

      if (body.id) {
        const existing = (await this.repos.scheduledNotification.load(au.churchId, body.id)) as ScheduledNotification;
        if (!existing) return this.json({ error: "Not found" }, 404);
        if (!this.canSendTo(au, existing.audience)) return this.json({ error: "Unauthorized" }, 401);
        if (existing.status !== "pending") return this.json({ error: "This notification has already been sent or cancelled" }, 409);
      }

      const sendNow = sendAt.getTime() <= Date.now() + IMMEDIATE_LEAD_MS;
      const row: ScheduledNotification = {
        id: body.id || undefined,
        churchId: au.churchId,
        audience,
        groupId: audience === "group" ? groupId : undefined,
        title,
        message,
        link: link || undefined,
        imageUrl: imageUrl || undefined,
        sendAt: sendNow ? new Date() : sendAt,
        timeZone: (body.timeZone || "").trim().substring(0, 64) || undefined,
        status: "pending",
        createdByPersonId: au.personId
      };
      const saved = await this.repos.scheduledNotification.save(row);
      if (!sendNow) return saved;

      const result = await ScheduledNotificationHelper.sendNow(this.repos, saved);
      if (!result) return this.json({ error: "This notification is already being sent" }, 409);
      return { ...saved, status: "sent", ...result };
    }) as any;
  }

  @httpPost("/:id/sendNow")
  public async sendNow(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const existing = (await this.repos.scheduledNotification.load(au.churchId, id)) as ScheduledNotification;
      if (!existing) return this.json({ error: "Not found" }, 404);
      if (!this.canSendTo(au, existing.audience)) return this.json({ error: "Unauthorized" }, 401);
      if (existing.status !== "pending") return this.json({ error: "This notification has already been sent or cancelled" }, 409);
      const result = await ScheduledNotificationHelper.sendNow(this.repos, existing);
      if (!result) return this.json({ error: "This notification is already being sent" }, 409);
      return { ...existing, status: "sent", ...result };
    }) as any;
  }

  @httpDelete("/:id")
  public async cancel(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const existing = (await this.repos.scheduledNotification.load(au.churchId, id)) as ScheduledNotification;
      if (!existing) return this.json({ error: "Not found" }, 404);
      if (!this.canSendTo(au, existing.audience)) return this.json({ error: "Unauthorized" }, 401);
      if (existing.status !== "pending" || !(await this.repos.scheduledNotification.cancel(au.churchId, id))) {
        return this.json({ error: "This notification has already been sent or cancelled" }, 409);
      }
      return { ...existing, status: "cancelled" };
    }) as any;
  }

  private canSendTo(au: any, audience?: string) {
    if (audience === "church") return au.checkAccess(Permissions.content.edit);
    if (audience === "group") return au.checkAccess(Permissions.groupMembers.edit);
    return false;
  }

  private validUrl(value: string) {
    return value.length <= URL_MAX && /^https?:\/\/[^\s]+$/i.test(value);
  }

  private validLink(value: string) {
    return value.length <= URL_MAX && (/^\/(?!\/)[^\s]*$/.test(value) || this.validUrl(value));
  }
}
