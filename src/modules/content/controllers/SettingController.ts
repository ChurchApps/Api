import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { Setting } from "../models";
import { ContentBaseController } from "./ContentBaseController";
import { Permissions, Environment } from "../helpers";
import { FileStorageHelper } from "@churchapps/apihelper";

@controller("/content/settings")
export class ContentSettingController extends ContentBaseController {
  @httpGet("/my")
  public async my(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return this.repos.setting.convertAllToModel(au.churchId, await this.repos.setting.loadUser(au.churchId, au.id));
    });
  }

  @httpGet("/")
  public async get(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      else {
        return this.repos.setting.convertAllToModel(au.churchId, await this.repos.setting.loadAll(au.churchId));
      }
    });
  }

  @httpPost("/my")
  public async postMy(req: express.Request<{}, {}, Setting[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Setting>[] = [];
      req.body.forEach((setting) => {
        setting.churchId = au.churchId;
        setting.userId = au.id;
        promises.push(this.saveSetting(setting));
      });
      const result = await Promise.all(promises);
      return this.repos.setting.convertAllToModel(au.churchId, result);
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

  @httpGet("/public/:churchId")
  public async publicRoute(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const settings = this.repos.setting.convertAllToModel(churchId, await this.repos.setting.loadPublicSettings(churchId));
      const result: any = {};
      settings.forEach((s) => {
        result[s.keyName] = s.value;
      });
      return result;
    });
  }

  @httpGet("/imports")
  public async getAutoImportSettings(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      else {
        const playlistId = req.query?.playlistId ? req.query.playlistId.toString() : "";
        const channelId = req.query?.channelId ? req.query.channelId.toString() : "";
        const type = req.query?.type ? req.query.type.toString() : "";
        let result = await this.repos.setting.loadByKeyNames(au.churchId, ["youtubeChannelId", "vimeoChannelId", "autoImportSermons"]);
        result = result.filter((r: any) => r.value !== ""); // remove rows with empty value
        if (playlistId && channelId) {
          const filteredData = this.repos.setting.getImports(result, type, playlistId, channelId);
          if (filteredData) return this.repos.setting.convertAllImports(filteredData);
        }
        result = this.repos.setting.getImports(result);
        return this.repos.setting.convertAllImports(result);
      }
    });
  }

  @httpDelete("/my/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.setting.deleteForUser(au.churchId, au.id, id);
      return this.json({ success: true });
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
