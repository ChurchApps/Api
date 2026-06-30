import { controller, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { NotificationHelper } from "../helpers/NotificationHelper.js";
import { NotificationCategoryHelper } from "../helpers/NotificationCategoryHelper.js";
import { NotificationPreference } from "../models/index.js";

@controller("/messaging/notificationpreferences")
export class NotificationPreferenceController extends MessagingBaseController {

  @httpGet("/categories")
  public async categories(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => NotificationCategoryHelper.all());
  }

  @httpGet("/my")
  public async loadMy(req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => this.resolve(au.churchId, au.personId));
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      // Legacy shape: an array of NotificationPreference rows. Kept working so
      // current B1App builds are unaffected (architecture §8.2).
      if (Array.isArray(req.body)) {
        const promises: Promise<NotificationPreference>[] = [];
        req.body.forEach((item: NotificationPreference) => { item.churchId = au.churchId; item.personId = au.personId; promises.push(this.repos.notificationPreference.save(item)); });
        const result = await Promise.all(promises);
        return this.repos.notificationPreference.convertAllToModel(result);
      }

      // New shape: global controls + sparse per-category overrides.
      const body = req.body || {};
      let pref = await this.repos.notificationPreference.loadByPersonId(au.churchId, au.personId);
      if (!pref) pref = await NotificationHelper.createNotificationPref(au.churchId, au.personId);
      for (const f of ["allowPush", "emailFrequency", "masterMute", "quietHoursStart", "quietHoursEnd", "timeZone", "maxPushPerDay"]) {
        if (body[f] !== undefined) (pref as any)[f] = body[f];
      }
      pref.allowSms = false; // SMS toggles rejected until Phase 3 (no transport / STOP handler yet)
      await this.repos.notificationPreference.save(pref);

      if (Array.isArray(body.overrides)) {
        for (const o of body.overrides) {
          if (!o?.categoryKey || !o?.channel) continue;
          if (NotificationCategoryHelper.isLocked(o.categoryKey)) continue; // locked categories can't be opted out of
          if (o.channel === "sms") continue; // Phase 3
          await this.repos.notificationPreferenceOverride.save({ churchId: au.churchId, personId: au.personId, categoryKey: o.categoryKey, channel: o.channel, optedIn: !!o.optedIn });
        }
      }
      return this.resolve(au.churchId, au.personId);
    });
  }

  private resolve = async (churchId: string, personId: string) => {
    let pref = await this.repos.notificationPreference.loadByPersonId(churchId, personId);
    if (!pref) pref = await NotificationHelper.createNotificationPref(churchId, personId);
    const overrides = (await this.repos.notificationPreferenceOverride.loadForPerson(churchId, personId)) as any[] || [];
    const categories = NotificationCategoryHelper.all().map((cat) => ({
      categoryKey: cat.categoryKey,
      displayName: cat.displayName,
      tier: cat.tier,
      locked: cat.tier === 0,
      allowedChannels: cat.allowedChannels,
      channels: {
        push: NotificationCategoryHelper.effectiveOptIn(cat.categoryKey, "push", overrides),
        email: NotificationCategoryHelper.effectiveOptIn(cat.categoryKey, "email", overrides),
        in_app: NotificationCategoryHelper.effectiveOptIn(cat.categoryKey, "in_app", overrides),
        sms: NotificationCategoryHelper.effectiveOptIn(cat.categoryKey, "sms", overrides)
      }
    }));
    // Additive: legacy clients keep reading allowPush/emailFrequency at the top level.
    return { ...pref, categories };
  };
}
