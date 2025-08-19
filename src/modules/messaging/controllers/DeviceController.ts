import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { Device } from "../models";

@controller("/messaging/devices")
export class DeviceController extends MessagingBaseController {
  @httpGet("/:churchId")
  public async loadByChurch(
    @requestParam("churchId") churchId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Device[]> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getMessagingRepositories();
      const data = await repos.device.loadByChurchId(au.churchId);
      return repos.device.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/person/:personId")
  public async loadByPerson(
    @requestParam("churchId") churchId: string,
    @requestParam("personId") personId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Device[]> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getMessagingRepositories();
      const data = await repos.device.loadByPersonId(au.churchId, personId);
      return repos.device.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/:id")
  public async loadById(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Device> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getMessagingRepositories();
      const data = await repos.device.loadById(au.churchId, id);
      return repos.device.convertToModel(data);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Device[]>, res: express.Response): Promise<Device[]> {
    return this.actionWrapperAnon(req, res, async () => {
      const repos = await this.getMessagingRepositories();
      const promises: Promise<Device>[] = [];
      req.body.forEach((device) => {
        device.lastActiveDate = new Date();
        if (!device.registrationDate) device.registrationDate = new Date();
        promises.push(repos.device.save(device));
      }) as any;
      const result = await Promise.all(promises);
      return repos.device.convertAllToModel(result as any[]);
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
      await repos.device.delete(au.churchId, id);
    }) as any;
  }
}
