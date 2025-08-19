import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { Notification } from "../models";
import { NotificationHelper } from "../helpers/NotificationHelper";

@controller("/messaging/notifications")
export class NotificationController extends MessagingBaseController {
  @httpGet("/:churchId/person/:personId")
  public async loadByPerson(
    @requestParam("churchId") churchId: string,
    @requestParam("personId") personId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Notification[]> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repositories.notification.loadByPersonId(au.churchId, personId);
      return this.repositories.notification.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/:id")
  public async loadById(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Notification> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repositories.notification.loadById(au.churchId, id);
      return this.repositories.notification.convertToModel(data);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Notification[]>, res: express.Response): Promise<Notification[]> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Notification>[] = [];
      req.body.forEach((notification) => {
        notification.churchId = au.churchId;
        promises.push(this.repositories.notification.save(notification));
      }) as any;
      const result = await Promise.all(promises);
      return this.repositories.notification.convertAllToModel(result as any[]);
    }) as any;
  }

  @httpPost("/markRead/:churchId/:personId")
  public async markRead(
    @requestParam("churchId") churchId: string,
    @requestParam("personId") personId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.notification.markRead(au.churchId, personId);
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

  @httpDelete("/:churchId/:id")
  public async delete(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.notification.delete(au.churchId, id);
    }) as any;
  }
}
