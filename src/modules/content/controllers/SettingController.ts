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
      return this.repositories.setting.convertAllToModel(au.churchId, await this.repositories.setting.loadUser(au.churchId, au.id));
    });
  }

  @httpGet("/")
  public async get(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      else {
        return this.repositories.setting.convertAllToModel(au.churchId, await this.repositories.setting.loadAll(au.churchId));
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
      return this.repositories.setting.convertAllToModel(au.churchId, result);
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
        return this.repositories.setting.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpGet("/public/:churchId")
  public async publicRoute(@requestParam("churchId") churchId: string): Promise<any> {
    console.log("made it");
    //try {
    const settings = this.repositories.setting.convertAllToModel(churchId, await this.repositories.setting.loadPublicSettings(churchId));
    console.log("Setting count", settings.length);
    const result: any = {};
    settings.forEach((s) => {
      result[s.keyName] = s.value;
    });
    return this.json(result, 200);
    //} catch (e) {
    //      this.logger.error(e);
    //return this.internalServerError(e);
    //}
  }

  @httpGet("/imports")
  public async getAutoImportSettings(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      else {
        const playlistId = req.query?.playlistId ? req.query.playlistId.toString() : "";
        const channelId = req.query?.channelId ? req.query.channelId.toString() : "";
        const type = req.query?.type ? req.query.type.toString() : "";
        let result = await this.repositories.setting.loadByKeyNames(au.churchId, ["youtubeChannelId", "vimeoChannelId", "autoImportSermons"]);
        result = result.filter((r: any) => r.value !== ""); // remove rows with empty value
        if (playlistId && channelId) {
          const filteredData = this.repositories.setting.getImports(result, type, playlistId, channelId);
          if (filteredData) return this.repositories.setting.convertAllImports(filteredData);
        }
        result = this.repositories.setting.getImports(result);
        return this.repositories.setting.convertAllImports(result);
      }
    });
  }

  @httpDelete("/my/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.setting.deleteForUser(au.churchId, au.id, id);
      return this.json({ success: true });
    });
  }

  private async saveSetting(setting: Setting) {
    if (setting.value.startsWith("data:image/")) setting = await this.saveImage(setting);
    setting = await this.repositories.setting.save(setting);
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
