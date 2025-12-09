import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { DeliveryLog } from "../models";

@controller("/messaging/deliverylogs")
export class DeliveryLogController extends MessagingBaseController {
  @httpGet("/content/:contentType/:contentId")
  public async loadByContent(
    @requestParam("contentType") contentType: string,
    @requestParam("contentId") contentId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<DeliveryLog[]> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.deliveryLog.loadByContent(contentType, contentId);
      return this.repos.deliveryLog.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/person/:personId")
  public async loadByPerson(
    @requestParam("personId") personId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<DeliveryLog[]> {
    return this.actionWrapper(req, res, async (au) => {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const data = await this.repos.deliveryLog.loadByPerson(au.churchId, personId, startDate, endDate);
      return this.repos.deliveryLog.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/recent")
  public async loadRecent(req: express.Request<{}, {}, null>, res: express.Response): Promise<DeliveryLog[]> {
    return this.actionWrapper(req, res, async (au) => {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const data = await this.repos.deliveryLog.loadRecent(au.churchId, limit);
      return this.repos.deliveryLog.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/:id")
  public async loadById(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<DeliveryLog> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.deliveryLog.loadById(au.churchId, id);
      return this.repos.deliveryLog.convertToModel(data);
    }) as any;
  }
}
