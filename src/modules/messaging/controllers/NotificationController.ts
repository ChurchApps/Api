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
      await this.initializeRepositories();
      const data = await this.messagingRepositories.notification.loadByPersonId(au.churchId, personId);
      return this.messagingRepositories.notification.convertAllToModel(data as any[]);
    });
  }

  @httpGet("/:churchId/:id")
  public async loadById(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Notification> {
    return this.actionWrapper(req, res, async (au) => {
      await this.initializeRepositories();
      const data = await this.messagingRepositories.notification.loadById(au.churchId, id);
      return this.messagingRepositories.notification.convertToModel(data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Notification[]>, res: express.Response): Promise<Notification[]> {
    return this.actionWrapper(req, res, async (au) => {
      await this.initializeRepositories();
      const promises: Promise<Notification>[] = [];
      req.body.forEach((notification) => {
        notification.churchId = au.churchId;
        promises.push(this.messagingRepositories.notification.save(notification));
      });
      const result = await Promise.all(promises);
      return this.messagingRepositories.notification.convertAllToModel(result as any[]);
    });
  }

  @httpPost("/markRead/:churchId/:personId")
  public async markRead(
    @requestParam("churchId") churchId: string,
    @requestParam("personId") personId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.initializeRepositories();
      await this.messagingRepositories.notification.markRead(au.churchId, personId);
    });
  }

  @httpPost("/sendTest")
  public async sendTestNotification(req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.initializeRepositories();
      const { personId, title } = req.body;
      const method = await NotificationHelper.notifyUser(au.churchId, personId, title || "Test Notification");
      return { method, success: true };
    });
  }

  @httpDelete("/:churchId/:id")
  public async delete(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.initializeRepositories();
      await this.messagingRepositories.notification.delete(au.churchId, id);
    });
  }
}
