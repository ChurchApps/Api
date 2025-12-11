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
      const data = await this.repos.notification.loadByPersonId(au.churchId, personId);
      return this.repos.notification.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/:id")
  public async loadById(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Notification> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.notification.loadById(au.churchId, id);
      return this.repos.notification.convertToModel(data);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Notification[]>, res: express.Response): Promise<Notification[]> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Notification>[] = [];
      req.body.forEach((notification) => {
        notification.churchId = au.churchId;
        promises.push(this.repos.notification.save(notification));
      }) as any;
      const result = await Promise.all(promises);
      return this.repos.notification.convertAllToModel(result as any[]);
    }) as any;
  }

  @httpPost("/markRead/:churchId/:personId")
  public async markRead(@requestParam("churchId") churchId: string, @requestParam("personId") personId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.notification.markRead(au.churchId, personId);
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

  @httpGet("/unreadCount")
  public async loadMyUnread(req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const existing = await this.repos.notification.loadNewCounts(au.churchId, au.personId);
      return existing || {};
    }) as any;
  }

  @httpGet("/my")
  public async loadMy(req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const existing = await this.repos.notification.loadForPerson(au.churchId, au.personId);
      await this.repos.notification.markAllRead(au.churchId, au.personId);
      return existing || {};
    }) as any;
  }

  @httpPost("/create")
  public async create(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      return await NotificationHelper.createNotifications(req.body.peopleIds, au.churchId, req.body.contentType, req.body.contentId, req.body.message, req.body?.link);
    }) as any;
  }

  @httpPost("/ping")
  public async ping(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => {
      return await NotificationHelper.createNotifications([req.body.personId], req.body.churchId, req.body.contentType, req.body.contentId, req.body.message);
    }) as any;
  }

  @httpGet("/tmpEmail")
  public async tmpEmail(req: express.Request<{}, {}, any>, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => {
      console.log("[tmpEmail] Endpoint called, initializing NotificationHelper...");
      NotificationHelper.init(this.repos);
      console.log("[tmpEmail] Calling sendEmailNotifications('daily')...");
      const result = await NotificationHelper.sendEmailNotifications("daily");
      console.log("[tmpEmail] Complete, result:", JSON.stringify(result));
      return result;
    }) as any;
  }

  @httpDelete("/:churchId/:id")
  public async delete(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.notification.delete(au.churchId, id);
    }) as any;
  }
}
