import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { MessagingCrudController } from "./MessagingCrudController.js";
import { NotificationHelper } from "../helpers/NotificationHelper.js";

@controller("/messaging/notificationpreferences")
export class NotificationPreferenceController extends MessagingCrudController {
  protected crudSettings = {
    repoKey: "notificationPreference",
    permissions: { view: null, edit: null },
    routes: ["post"] as const
  };

  @httpGet("/my")
  public async loadMy(req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      let result = await this.repos.notificationPreference.loadByPersonId(au.churchId, au.personId);
      if (!result) result = await NotificationHelper.createNotificationPref(au.churchId, au.personId);
      return result;
    });
  }
}
