import { controller, httpPost, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { Setting } from "../models/index.js";
import { Permissions, FileStorageHelper, Environment } from "../helpers/index.js";
import { MembershipBaseController } from "./MembershipBaseController.js";

@controller("/membership/settings")
export class MembershipSettingController extends MembershipBaseController {
  @httpGet("/")
  public async get(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      else {
        return this.repos.setting.convertAllToModel(au.churchId, (await this.repos.setting.loadAll(au.churchId)) as any[]);
      }
    });
  }

  @httpPost("/")
  public async post(req: express.Request<{}, {}, Setting[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Setting>[] = [];
        req.body.forEach((setting) => {
          setting.churchId = au.churchId;
          promises.push(this.saveSetting(setting));
        });
        const result = await Promise.all(promises);
        return this.repos.setting.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpGet("/public/:churchId/app-theme")
  public async appTheme(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const publicSettings = await this.repos.setting.loadPublicSettings(churchId);
      if (!publicSettings || !Array.isArray(publicSettings)) return {};
      const settings = this.repos.setting.convertAllToModel(churchId, publicSettings as any[]);
      if (!settings || !Array.isArray(settings)) return {};
      const themeSetting = settings.find((s: Setting) => s.keyName === "appTheme");
      if (!themeSetting?.value) return {};
      try { return JSON.parse(themeSetting.value); } catch { return {}; }
    });
  }

  @httpGet("/public/:churchId/checkin-theme")
  public async checkinTheme(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const publicSettings = await this.repos.setting.loadPublicSettings(churchId);
      if (!publicSettings || !Array.isArray(publicSettings)) return {};
      const settings = this.repos.setting.convertAllToModel(churchId, publicSettings as any[]);
      if (!settings || !Array.isArray(settings)) return {};
      const themeSetting = settings.find((s: Setting) => s.keyName === "checkinTheme");
      if (!themeSetting?.value) return {};
      try { return JSON.parse(themeSetting.value); } catch { return {}; }
    });
  }

  @httpGet("/public/:churchId")
  public async publicRoute(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const publicSettings = await this.repos.setting.loadPublicSettings(churchId);

      // Handle case where publicSettings is undefined or not an array
      if (!publicSettings || !Array.isArray(publicSettings)) {
        return {};
      }

      const settings = this.repos.setting.convertAllToModel(churchId, publicSettings as any[]);

      // Handle case where settings conversion fails
      if (!settings || !Array.isArray(settings)) {
        return {};
      }

      const result: any = {};
      settings.forEach((s) => {
        result[s.keyName] = s.value;
      });
      return result;
    });
  }

  private async saveSetting(setting: Setting) {
    if (setting.value.startsWith("data:image/")) setting = await this.saveImage(setting);
    setting = await this.repos.setting.save(setting);
    return setting;
  }

  private async saveImage(setting: Setting) {
    const base64 = setting.value.split(",")[1];
    const key = "/" + setting.churchId + "/settings/" + setting.keyName + ".png";
    await FileStorageHelper.store(key, "image/png", Buffer.from(base64, "base64"));
    const photoUpdated = new Date();
    setting.value = Environment.contentRoot + key + "?dt=" + photoUpdated.getTime().toString();
    return setting;
  }
}
