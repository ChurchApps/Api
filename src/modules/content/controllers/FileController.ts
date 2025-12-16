import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController";
import { File } from "../models";
import { Permissions } from "../../../shared/helpers";
import { AwsHelper, FileStorageHelper } from "@churchapps/apihelper";
import { Environment } from "../helpers";

@controller("/content/files")
export class FileController extends ContentBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.file.load(au.churchId, id);
    });
  }

  @httpGet("/:contentType/:contentId")
  public async getByContent(@requestParam("contentType") contentType: string, @requestParam("contentId") contentId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.file.loadForContent(au.churchId, contentType, contentId);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.file.loadForWebsite(au.churchId);
    });
  }

  // Known bug - This post accepts multiple File modals but only a single file upload.  It's not a problem because the app restricts users to one upload at a time (for now).
  @httpPost("/")
  public async save(req: express.Request<{}, {}, File[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit) && au.groupIds.indexOf(req.body[0].contentId) === -1) {
        return this.json({}, 401);
      } else {
        const promises: Promise<File>[] = [];
        req.body.forEach((file) => {
          file.churchId = au.churchId;
          const f = file;
          const saveFunction = async () => {
            await this.saveFile(au.churchId, f);
            return await this.repos.file.save(f);
          };
          promises.push(saveFunction());
        });
        const result = await Promise.all(promises);
        return result;
      }
    });
  }

  @httpPost("/postUrl")
  public async getUploadUrl(req: express.Request<{}, {}, { resourceId: string; fileName: string; contentType: string; contentId: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit) && au.groupIds.indexOf(req.body.contentId) === -1) return this.json({}, 401);
      else {
        const totalBytes = await this.repos.file.loadTotalBytes(au.churchId, req.body.contentType, req.body.contentId);
        if (totalBytes?.size > 100000000) return this.json({}, 401);
        else {
          let key = "/" + au.churchId + "/files/" + req.body.fileName;
          if  (req.body.contentId) key = "/" + au.churchId + "/files/" + req.body.contentType + "/" + req.body.contentId + "/" + req.body.fileName;
          const result = Environment.fileStore === "S3" ? await AwsHelper.S3PresignedUrl(key) : {};
          return result;
        }
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const existingFile = await this.repos.file.load(au.churchId, id);
      if (!au.checkAccess(Permissions.content.edit) && au.groupIds.indexOf(existingFile.contentId) === -1) return this.json({}, 401);
      else {
        await FileStorageHelper.remove(au.churchId + "/files/" + existingFile.fileName);
        await this.repos.file.delete(au.churchId, id);
        return { file: au.churchId + "/files/" + existingFile.fileName };
      }
    });
  }

  private async saveFile(churchId: string, file: File) {
    const key = "/" + churchId + "/files/" + file.fileName;
    if (file.id) {
      // delete existing uploadFile
      const existingFile = await this.repos.file.load(file.churchId, file.id);
      const oldKey = "/" + churchId + "/files/" + existingFile.fileName;
      if (oldKey !== key) await FileStorageHelper.remove(oldKey);
    }

    if (file.fileContents) {
      const base64 = file.fileContents.split(",")[1];
      const buffer = Buffer.from(base64, "base64");
      await FileStorageHelper.store(key, file.fileType, buffer);
    }

    const fileUpdated = new Date();
    file.contentPath = Environment.contentRoot + key + "?dt=" + fileUpdated.getTime().toString();
    file.fileContents = null;
    return file;
  }
}
