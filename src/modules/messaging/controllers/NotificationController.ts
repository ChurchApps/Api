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
      const repos = await this.getMessagingRepositories();
      const data = await repos.notification.loadByPersonId(au.churchId, personId);
      return repos.notification.convertAllToModel(data as any[]);
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
      const repos = await this.getMessagingRepositories();
      const data = await repos.notification.loadById(au.churchId, id);
      return repos.notification.convertToModel(data);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Notification[]>, res: express.Response): Promise<Notification[]> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getMessagingRepositories();
      const promises: Promise<Notification>[] = [];
      req.body.forEach((notification) => {
        notification.churchId = au.churchId;
        promises.push(repos.notification.save(notification));
      }) as any;
      const result = await Promise.all(promises);
      return repos.notification.convertAllToModel(result as any[]);
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
      const repos = await this.getMessagingRepositories();
      await repos.notification.markRead(au.churchId, personId);
    }) as any;
  }

  @httpPost("/sendTest")
  public async sendTestNotification(req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getMessagingRepositories();
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
      const repos = await this.getMessagingRepositories();
      await repos.notification.delete(au.churchId, id);
    }) as any;
  }
}
