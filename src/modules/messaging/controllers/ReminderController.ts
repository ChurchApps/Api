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
import { ContentRepos, ForeignEventRow } from "../helpers/ForeignRepos.js";
import { LEADER_GAPS_MODE } from "../helpers/adapters/PlanReminderAdapter.js";

// Save body for a reminder definition; offsets and channels may arrive as arrays or as CSV strings.
interface ReminderDefinitionBody {
  offsets?: string | (string | number)[];
  sendLocalTime?: string;
  timeZone?: string;
  message?: string;
  channels?: string | string[];
  recipientMode?: string;
  enabled?: boolean;
}

interface EntityMuteBody { entityType?: string; entityId?: string; level?: string }

@controller("/messaging/reminders")
export class ReminderController extends MessagingBaseController {
  // Generic over entityType (event|plan|task). The /event/:id/preview route below is 3 segments, so it never collides with these 2-segment routes.
  // Texting volunteers and groups needs texting.send, so turning on the sms channel does too. A
  // definition that already texts can still be edited by content.edit.
  private addsSms(channels: unknown, existingChannels?: string): boolean {
    const list = (value: unknown) => (Array.isArray(value) ? value : String(value || "").split(",")).map((c) => String(c).trim());
    return list(channels).includes("sms") && !list(existingChannels).includes("sms");
  }

  @httpGet("/:entityType/:entityId")
  public async listForEntity(@requestParam("entityType") entityType: string, @requestParam("entityId") entityId: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      ensureRemindersReady(this.repos);
      if (!ReminderAdapterRegistry.has(entityType)) return this.json({}, 400);
      return this.repos.reminderDefinition.loadForEntity(au.churchId, entityType, entityId);
    });
  }

  @httpPost("/:entityType/:entityId")
  public async saveForEntity(@requestParam("entityType") entityType: string, @requestParam("entityId") entityId: string, req: express.Request<{}, {}, ReminderDefinitionBody>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      ensureRemindersReady(this.repos);
      const adapter = ReminderAdapterRegistry.get(entityType);
      if (!adapter) return this.json({}, 400);
      const body = req.body || {};
      const existing = (await this.repos.reminderDefinition.loadForEntity(au.churchId, entityType, entityId)) as ReminderDefinition[];
      if (this.addsSms(body.channels, existing[0]?.channels) && !au.checkAccess(Permissions.texting.send)) return this.json({ error: "Sending texts requires the Texting Send permission" }, 401);
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

  // Send the saved reminder to its recipients right away (issue #1584). Scope definitions have no single target, so only entity reminders.
  @httpPost("/:entityType/:entityId/sendNow")
  public async sendNow(@requestParam("entityType") entityType: string, @requestParam("entityId") entityId: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      ensureRemindersReady(this.repos);
      if (!ReminderAdapterRegistry.has(entityType)) return this.json({}, 400);
      const def = ((await this.repos.reminderDefinition.loadForEntity(au.churchId, entityType, entityId)) as ReminderDefinition[])[0];
      if (!def || !def.enabled) return this.json({ error: "Save and enable the reminder first" }, 400);
      const channels = String(def.channels || "").split(",").map((c) => c.trim());
      if (channels.includes("sms") && !au.checkAccess(Permissions.texting.send)) return this.json({ error: "Sending texts requires the Texting Send permission" }, 401);
      const result = await ReminderEngine.sendNow(def);
      return { sent: result.recipients, textsSent: result.textsSent, textsSkipped: result.textsSkipped };
    });
  }

  // Scope (inheritance) definitions: entityId null, scopeId set (e.g. serving reminders per planType).
  // 3-segment paths never collide with the 2-segment entity routes above.
  @httpGet("/scope/:entityType/:scopeId")
  public async listForScope(@requestParam("entityType") entityType: string, @requestParam("scopeId") scopeId: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      ensureRemindersReady(this.repos);
      if (!ReminderAdapterRegistry.has(entityType)) return this.json({}, 400);
      return this.repos.reminderDefinition.loadForScope(au.churchId, entityType, scopeId);
    });
  }

  @httpPost("/scope/:entityType/:scopeId")
  public async saveForScope(@requestParam("entityType") entityType: string, @requestParam("scopeId") scopeId: string, req: express.Request<{}, {}, ReminderDefinitionBody>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      ensureRemindersReady(this.repos);
      const adapter = ReminderAdapterRegistry.get(entityType);
      if (!adapter) return this.json({}, 400);
      const body = req.body || {};
      // A scope holds one volunteer reminder and, beside it, at most one leader gap alert.
      const isGapAlert = (mode?: string) => mode === LEADER_GAPS_MODE;
      const current = ((await this.repos.reminderDefinition.loadForScope(au.churchId, entityType, scopeId)) as ReminderDefinition[])
        .find((d) => isGapAlert(d.recipientMode) === isGapAlert(body.recipientMode));
      if (this.addsSms(body.channels, current?.channels) && !au.checkAccess(Permissions.texting.send)) return this.json({ error: "Sending texts requires the Texting Send permission" }, 401);
      const def: ReminderDefinition = {
        id: current?.id,
        churchId: au.churchId,
        entityType,
        entityId: undefined, // scope definition — inherited by every entity in the scope
        scopeId,
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
      await ReminderEngine.reExpandForScope(au.churchId, entityType, scopeId); // synchronous expand — §5.8
      return saved;
    });
  }

  @httpDelete("/:defId")
  public async remove(@requestParam("defId") defId: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      if (!(await this.repos.reminderDefinition.load(au.churchId, defId))) return this.json({}, 404);
      await this.repos.reminderOccurrence.cancelPendingForDefinition(defId);
      await this.repos.reminderDefinition.delete(au.churchId, defId);
      return this.json({});
    });
  }

  @httpGet("/event/:eventId/preview")
  public async preview(@requestParam("eventId") eventId: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      ensureRemindersReady(this.repos);
      const adapter = ReminderAdapterRegistry.get("event")!;
      const entity = (await adapter.loadEntity(au.churchId, eventId)) as ForeignEventRow | null; // the "event" adapter loads events
      if (!entity) return { recipientCount: 0, scope: "none", unlinkedAttendeeCount: 0, nextFires: [] };

      const recipientMode = (req.query.recipientMode as string) || "auto";
      const recipients = await adapter.loadRecipients(au.churchId, entity, "", recipientMode);
      const scope = entity.registrationEnabled && recipientMode !== "group" ? "registrants" : "group";

      let unlinkedAttendeeCount = 0;
      if (scope === "registrants") {
        const content = await RepoManager.getRepos<ContentRepos>("content");
        const members = (await content.registrationMember.loadForEvent(au.churchId, eventId)) || [];
        unlinkedAttendeeCount = members.filter((m) => !m.personId).length;
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
  public async log(req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.messaging.admin) && !au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      return this.repos.reminderOccurrence.loadRecent(au.churchId, 50);
    });
  }

  // The caller's own per-entity mutes (e.g. muted groups), never anyone else's; ?entityType=group narrows the list.
  @httpGet("/mute")
  public async myMutes(req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.personId) return [];
      const mutes = (await this.repos.notificationEntityMute.loadForPerson(au.churchId, au.personId)) as NotificationEntityMute[];
      const entityType = typeof req.query.entityType === "string" ? req.query.entityType : "";
      return entityType ? mutes.filter((m) => m.entityType === entityType) : mutes;
    });
  }

  @httpPost("/mute")
  public async mute(req: express.Request<{}, {}, EntityMuteBody>, res: express.Response): Promise<unknown> {
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
