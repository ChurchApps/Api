import { controller, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { NotificationHelper } from "../helpers/NotificationHelper.js";
import { NotificationPreference } from "../models/index.js";

@controller("/messaging/notificationpreferences")
export class NotificationPreferenceController extends MessagingBaseController {

  @httpGet("/my")
  public async loadMy(req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      let result = await this.repos.notificationPreference.loadByPersonId(au.churchId, au.personId);
      if (!result) result = await NotificationHelper.createNotificationPref(au.churchId, au.personId);
      return result;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, NotificationPreference[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<NotificationPreference>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.notificationPreference.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.notificationPreference.convertAllToModel(result);
    });
  }
}
