import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";

@controller("/messaging/deliverylogs")
export class DeliveryLogController extends MessagingBaseController {
  @httpGet("/content/:contentType/:contentId")
  public async loadByContent(
    @requestParam("contentType") contentType: string,
    @requestParam("contentId") contentId: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.messaging.admin)) return this.json([], 401);
      const data = await this.repos.deliveryLog.loadByContent(au.churchId, contentType, contentId);
      return this.repos.deliveryLog.convertAllToModel(data);
    });
  }

  // Only whether the last email bounced, so People viewers get the profile warning without the full delivery log.
  @httpGet("/person/:personId/emailStatus")
  public async loadEmailStatus(
    @requestParam("personId") personId: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const allowed = personId === au.personId || au.checkAccess(Permissions.people.view) || au.checkAccess(Permissions.people.edit) || au.checkAccess(Permissions.messaging.admin);
      if (!allowed) return this.json({}, 401);
      const latest = await this.repos.deliveryLog.loadLatestEmailEvent(au.churchId, personId);
      if (latest?.deliveryMethod !== "sesBounce") return { bounced: false };
      return { bounced: true, address: latest.deliveryAddress, date: latest.attemptTime };
    });
  }

  // Recent failed sends for the person page. People editors only; the date, channel, address and error, never the message.
  @httpGet("/person/:personId/failures")
  public async loadFailuresByPerson(
    @requestParam("personId") personId: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json([], 401);
      const rows = await this.repos.deliveryLog.loadFailuresByPerson(au.churchId, personId, 25);
      return rows.map((r) => ({ attemptTime: r.attemptTime, deliveryMethod: r.deliveryMethod, deliveryAddress: r.deliveryAddress, errorMessage: r.errorMessage }));
    });
  }

  @httpGet("/person/:personId")
  public async loadByPerson(
    @requestParam("personId") personId: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (personId !== au.personId && !au.checkAccess(Permissions.messaging.admin)) return this.json([], 401);
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const data = await this.repos.deliveryLog.loadByPerson(au.churchId, personId, startDate, endDate);
      return this.repos.deliveryLog.convertAllToModel(data);
    });
  }

  @httpGet("/recent")
  public async loadRecent(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.messaging.admin)) return this.json([], 401);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 100, 1), 500);
      const data = await this.repos.deliveryLog.loadRecent(au.churchId, limit);
      return this.repos.deliveryLog.convertAllToModel(data);
    });
  }

  @httpGet("/:id")
  public async loadById(
    @requestParam("id") id: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.deliveryLog.loadById(au.churchId, id);
      if (data?.personId !== au.personId && !au.checkAccess(Permissions.messaging.admin)) return this.json({}, 401);
      return this.repos.deliveryLog.convertToModel(data);
    });
  }
}
