import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { Device } from "../models";

@controller("/messaging/devices")
export class DeviceController extends MessagingBaseController {
  @httpPost("/enroll")
  public async enroll(req: express.Request<{}, {}, Device>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      // Look up existing device by fcmToken and churchId (for mobile app registration)
      let result = await this.repos.device.loadByFcmToken(au.churchId, req.body.fcmToken);

      // Fall back to deviceId lookup for pairing code flow
      if (!result && req.body.deviceId) {
        result = await this.repos.device.loadByDeviceId(req.body.deviceId);
      }

      if (result) {
        // Update existing device
        result.fcmToken = req.body.fcmToken || result.fcmToken;
        result.personId = req.body.personId || null;
        result.label = req.body.label || result.label;
        result.deviceInfo = req.body.deviceInfo || result.deviceInfo;
        result.pairingCode = req.body.pairingCode || result.pairingCode;
        result.lastActiveDate = new Date();
        await this.repos.device.save(result);
      } else {
        // Create new device
        const device: Device = {
          ...req.body,
          churchId: au.churchId,
          appName: req.body.appName || "B1Mobile",
          registrationDate: new Date(),
          lastActiveDate: new Date()
        };
        result = await this.repos.device.save(device);
      }
      return result;
    });
  }

  @httpGet("/pair/:pairingCode")
  public async pair(@requestParam("pairingCode") pairingCode: string, req: express.Request<{}, {}, {}>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      let success = false;
      const existing = await this.repos.device.loadByPairingCode(pairingCode);
      if (existing) {
        existing.personId = au.personId;
        existing.churchId = au.churchId;
        existing.pairingCode = "";
        await this.repos.device.save(existing);
        success = true;
      }
      return { success };
    });
  }

  @httpGet("/:churchId")
  public async loadByChurch(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Device[]> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.device.loadByChurchId(au.churchId);
      return this.repos.device.convertAllToModel(au.churchId, data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/person/:personId")
  public async loadByPerson(@requestParam("churchId") churchId: string, @requestParam("personId") personId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Device[]> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.device.loadByPersonId(au.churchId, personId);
      return this.repos.device.convertAllToModel(au.churchId, data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/:id")
  public async loadById(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Device> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.device.loadById(au.churchId, id);
      return this.repos.device.convertToModel(au.churchId, data);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Device[]>, res: express.Response): Promise<Device[]> {
    return this.actionWrapperAnon(req, res, async () => {
      const promises: Promise<Device>[] = [];
      req.body.forEach((device) => {
        device.lastActiveDate = new Date();
        if (!device.registrationDate) device.registrationDate = new Date();
        promises.push(this.repos.device.save(device));
      }) as any;
      const result = await Promise.all(promises);
      return this.repos.device.convertAllToModel("", result as any[]);
    }) as any;
  }

  @httpDelete("/:churchId/:id")
  public async delete(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.device.delete(au.churchId, id);
    }) as any;
  }
}
