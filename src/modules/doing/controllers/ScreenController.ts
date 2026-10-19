import { controller, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import crypto from "crypto";
import { DoingBaseController } from "./DoingBaseController.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { getMessagingModuleGateway } from "../../../shared/modules/index.js";
import { ScreenGroup } from "../models/index.js";
import { ScreenManifestHelper } from "../helpers/ScreenManifestHelper.js";

const SCREEN_CONTENT_TYPE = "freeplayScreen";

@controller("/doing/screens")
export class ScreenController extends DoingBaseController {
  private async loadDevice(deviceId: string, req: express.Request): Promise<any | null> {
    const provided = req.header("x-device-secret");
    if (!provided) return null;
    const device = await getMessagingModuleGateway().loadDeviceByDeviceId(deviceId);
    if (!device?.secret || !device.churchId) return null;
    const expected = Buffer.from(device.secret);
    const actual = Buffer.from(provided);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual) ? device : null;
  }

  @httpGet("/manifest/:deviceId")
  public async manifest(@requestParam("deviceId") deviceId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const device = await this.loadDevice(deviceId, req);
      if (!device) return this.json({}, 401);
      if (device.contentType !== SCREEN_CONTENT_TYPE || !device.contentId) return this.json({ error: "Device is not a scheduled screen" }, 404);
      const manifest = await ScreenManifestHelper.buildCached(this.repos, device.id, device.churchId, device.contentId, true);
      if (!manifest) return this.json({ error: "Screen group not found" }, 404);
      return manifest;
    });
  }

  @httpPost("/status/:deviceId")
  public async status(@requestParam("deviceId") deviceId: string, req: express.Request<{}, {}, unknown>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const device = await this.loadDevice(deviceId, req);
      if (!device) return this.json({}, 401);
      await getMessagingModuleGateway().saveDeviceStatus(device.churchId, device.id, req.body ?? null);
      return {};
    });
  }

  @httpGet("/timeZone")
  public async timeZone(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      return { timeZone: await ScreenManifestHelper.churchTimeZone(au.churchId) };
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const devices = await getMessagingModuleGateway().loadDevicesByApp(au.churchId, "FreePlay");
      const groups: ScreenGroup[] = this.repos.screenGroup.convertAllToModel(au.churchId, await this.repos.screenGroup.loadAll(au.churchId));
      const groupNames = new Map(groups.map((g) => [g.id, g.name]));
      return devices.map((d: any) => {
        const screenGroupId = d.contentType === SCREEN_CONTENT_TYPE ? d.contentId : null;
        return {
          id: d.id,
          deviceId: d.deviceId,
          label: d.label,
          deviceInfo: d.deviceInfo,
          registrationDate: d.registrationDate,
          lastActiveDate: d.lastActiveDate,
          contentType: d.contentType,
          contentId: d.contentId,
          screenGroupId,
          screenGroupName: screenGroupId ? groupNames.get(screenGroupId) || null : null,
          status: d.status ?? null
        };
      });
    });
  }
}
