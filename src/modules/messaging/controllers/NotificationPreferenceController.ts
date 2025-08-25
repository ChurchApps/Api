import { controller, httpGet, httpPost, interfaces } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { NotificationPreference } from "../models";
import { NotificationHelper } from "../helpers/NotificationHelper";

@controller("/messaging/notificationpreferences")
export class NotificationPreferenceController extends MessagingBaseController {
  @httpPost("/")
  public async save(req: express.Request<{}, {}, NotificationPreference[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<NotificationPreference>[] = [];
      req.body.forEach((n) => {
        n.churchId = au.churchId;
        promises.push(this.repositories.notificationPreference.save(n));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpGet("/my")
  public async loadMy(req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      let result = await this.repositories.notificationPreference.loadByPersonId(au.churchId, au.personId);
      if (!result) result = await NotificationHelper.createNotificationPref(au.churchId, au.personId);
      return result;
    });
  }
}
