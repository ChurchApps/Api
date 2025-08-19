import { controller, httpPost, requestParam, httpDelete, interfaces, httpGet } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { DeviceContent } from "../models";

@controller("/messaging/devicecontents")
export class DeviceContentController extends MessagingBaseController {
  @httpGet("/deviceId/:deviceId")
  public async getUnique(
    @requestParam("deviceId") deviceId: string,
    req: express.Request<{}, {}, {}>,
    res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const deviceContent = await this.repositories.deviceContent.loadByDeviceId(au.churchId, deviceId);
      return deviceContent;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, DeviceContent[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<DeviceContent>[] = [];
      req.body.forEach((deviceContent) => {
        deviceContent.churchId = au.churchId;
        promises.push(this.repositories.deviceContent.save(deviceContent));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.deviceContent.delete(au.churchId, id);
      return this.json({});
    });
  }
}