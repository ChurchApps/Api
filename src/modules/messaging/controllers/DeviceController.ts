import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { Device } from "../models";

@controller("/messaging/devices")
export class DeviceController extends MessagingBaseController {
  @httpGet("/:churchId")
  public async loadByChurch(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Device[]> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repositories.device.loadByChurchId(au.churchId);
      return this.repositories.device.convertAllToModel(au.churchId, data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/person/:personId")
  public async loadByPerson(@requestParam("churchId") churchId: string, @requestParam("personId") personId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Device[]> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repositories.device.loadByPersonId(au.churchId, personId);
      return this.repositories.device.convertAllToModel(au.churchId, data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/:id")
  public async loadById(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Device> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repositories.device.loadById(au.churchId, id);
      return this.repositories.device.convertToModel(au.churchId, data);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Device[]>, res: express.Response): Promise<Device[]> {
    return this.actionWrapperAnon(req, res, async () => {
      const promises: Promise<Device>[] = [];
      req.body.forEach((device) => {
        device.lastActiveDate = new Date();
        if (!device.registrationDate) device.registrationDate = new Date();
        promises.push(this.repositories.device.save(device));
      }) as any;
      const result = await Promise.all(promises);
      return this.repositories.device.convertAllToModel("", result as any[]);
    }) as any;
  }

  @httpDelete("/:churchId/:id")
  public async delete(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.device.delete(au.churchId, id);
    }) as any;
  }
}
