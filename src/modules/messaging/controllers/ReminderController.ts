import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { getMembershipModuleGateway } from "../../../shared/modules/MembershipModuleGateway.js";
import { ReminderEngine } from "../helpers/ReminderEngine.js";
import { ReminderAdapterRegistry } from "../helpers/ReminderAdapter.js";
import { TimezoneHelper } from "../helpers/TimezoneHelper.js";
import { ensureRemindersReady } from "../helpers/ReminderBootstrap.js";
import { ReminderDefinition, NotificationEntityMute } from "../models/index.js";

@controller("/messaging/reminders")
export class ReminderController extends MessagingBaseController {
  // Generic over entityType (event|plan|task). The /event/:id/preview route below is 3 segments, so it never collides with these 2-segment routes.
  @httpGet("/:entityType/:entityId")
  public async listForEntity(@requestParam("entityType") entityType: string, @requestParam("entityId") entityId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      ensureRemindersReady(this.repos);
      if (!ReminderAdapterRegistry.has(entityType)) return this.json({}, 400);
      return this.repos.reminderDefinition.loadForEntity(au.churchId, entityType, entityId);
    });
  }

  @httpPost("/:entityType/:entityId")
  public async saveForEntity(@requestParam("entityType") entityType: string, @requestParam("entityId") entityId: string, req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      ensureRemindersReady(this.repos);
      const adapter = ReminderAdapterRegistry.get(entityType);
      if (!adapter) return this.json({}, 400);
      const body = req.body || {};
      const existing = (await this.repos.reminderDefinition.loadForEntity(au.churchId, entityType, entityId)) as ReminderDefinition[];
      const def: ReminderDefinition = {
        id: existing[0]?.id,
        churchId: au.churchId,
        entityType,
        entityId,
        category: adapter.category,
        offsets: Array.isArray(body.offsets) ? body.offsets.join(",") : body.offsets,
        sendLocalTime: body.sendLocalTime ? this.normalizeTime(body.sendLocalTime) : undefined,
        timeZone: body.timeZone,
        message: body.message,
        channels: Array.isArray(body.channels) ? body.channels.join(",") : body.channels,
        recipientMode: body.recipientMode,
        enabled: body.enabled !== false
      };
      const saved = await this.repos.reminderDefinition.save(def);
      await ReminderEngine.reExpandForEntity(au.churchId, entityType, entityId); // synchronous expand — §5.8
      return saved;
    });
  }

  @httpDelete("/:defId")
  public async remove(@requestParam("defId") defId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      await this.repos.reminderOccurrence.cancelPendingForDefinition(defId);
      await this.repos.reminderDefinition.delete(au.churchId, defId);
      return this.json({});
    });
  }

  @httpGet("/event/:eventId/preview")
  public async preview(@requestParam("eventId") eventId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      ensureRemindersReady(this.repos);
      const adapter = ReminderAdapterRegistry.get("event")!;
      const entity = await adapter.loadEntity(au.churchId, eventId);
      if (!entity) return { recipientCount: 0, scope: "none", unlinkedAttendeeCount: 0, nextFires: [] };

      const recipientMode = (req.query.recipientMode as string) || "auto";
      const recipients = await adapter.loadRecipients(au.churchId, entity, "", recipientMode);
      const scope = entity.registrationEnabled && recipientMode !== "group" ? "registrants" : "group";

      let unlinkedAttendeeCount = 0;
      if (scope === "registrants") {
        const content = await RepoManager.getRepos<any>("content");
        const members = (await content.registrationMember.loadForEvent(au.churchId, eventId)) || [];
        unlinkedAttendeeCount = members.filter((m: any) => !m.personId).length;
      }

      const offsets = ReminderEngine.parseOffsets((req.query.offsets as string) || "1440");
      const sendLocalTime = this.normalizeTime((req.query.sendLocalTime as string) || "09:00:00");
      const tz = (req.query.timeZone as string) || (await getMembershipModuleGateway().loadChurch(au.churchId))?.timeZone || "America/New_York";
      const now = new Date();
      const occ = await adapter.getOccurrences(entity, now, new Date(now.getTime() + 14 * 24 * 60 * 60000));
      const nextFires = occ
        .flatMap((o) => offsets.map((off) => TimezoneHelper.computeFireAt(o.startLocalDate, sendLocalTime, off, tz)))
        .filter((d) => d.getTime() >= now.getTime())
        .sort((a, b) => a.getTime() - b.getTime())
        .slice(0, 5)
        .map((d) => d.toISOString());

      return { recipientMode, recipientCount: recipients.length, scope, unlinkedAttendeeCount, nextFires };
    });
  }

  @httpGet("/log")
  public async log(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.messaging.admin) && !au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      return this.repos.reminderOccurrence.loadRecent(au.churchId, 50);
    });
  }

  @httpPost("/mute")
  public async mute(req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const body = req.body || {};
      if (!body.entityType || !body.entityId) return this.json({}, 400);
      const mute: NotificationEntityMute = {
        churchId: au.churchId,
        personId: au.personId,
        entityType: body.entityType,
        entityId: body.entityId,
        level: body.level || "all"
      };
      return this.repos.notificationEntityMute.save(mute);
    });
  }

  private normalizeTime(t: string): string {
    // accept "09:00" or "09:00:00"
    const parts = t.split(":");
    while (parts.length < 3) parts.push("00");
    return parts.slice(0, 3).map((p) => p.padStart(2, "0")).join(":");
  }
}
