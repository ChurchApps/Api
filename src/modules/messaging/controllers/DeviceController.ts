import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { Device } from "../models";

@controller("/devices")
export class DeviceController extends MessagingBaseController {
  @httpGet("/:churchId")
  public async loadByChurch(
    @requestParam("churchId") churchId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Device[]> {
    return this.actionWrapper(req, res, async (au) => {
      await this.initializeRepositories();
      const data = await this.messagingRepositories.device.loadByChurchId(au.churchId);
      return this.messagingRepositories.device.convertAllToModel(data as any[]);
    });
  }

  @httpGet("/:churchId/person/:personId")
  public async loadByPerson(
    @requestParam("churchId") churchId: string,
    @requestParam("personId") personId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Device[]> {
    return this.actionWrapper(req, res, async (au) => {
      await this.initializeRepositories();
      const data = await this.messagingRepositories.device.loadByPersonId(au.churchId, personId);
      return this.messagingRepositories.device.convertAllToModel(data as any[]);
    });
  }

  @httpGet("/:churchId/:id")
  public async loadById(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Device> {
    return this.actionWrapper(req, res, async (au) => {
      await this.initializeRepositories();
      const data = await this.messagingRepositories.device.loadById(au.churchId, id);
      return this.messagingRepositories.device.convertToModel(data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Device[]>, res: express.Response): Promise<Device[]> {
    return this.actionWrapperAnon(req, res, async () => {
      await this.initializeRepositories();
      const promises: Promise<Device>[] = [];
      req.body.forEach((device) => {
        device.lastActiveDate = new Date();
        if (!device.registrationDate) device.registrationDate = new Date();
        promises.push(this.messagingRepositories.device.save(device));
      });
      const result = await Promise.all(promises);
      return this.messagingRepositories.device.convertAllToModel(result as any[]);
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
      await this.messagingRepositories.device.delete(au.churchId, id);
    });
  }
}
