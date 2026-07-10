import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import path from "path";
import { ContentBaseController } from "./ContentBaseController.js";
import { File } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import type { IStorageProvider } from "@churchapps/apihelper";
import { StorageResolver } from "../helpers/StorageResolver.js";
import { QuotaExceededError } from "../helpers/MinistryStuffStorageProvider.js";

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
        const storage = await StorageResolver.forChurch(this.repos.storageProvider, au.churchId);
        if (storage.name === "churchapps") {
          const totalBytes = await this.repos.file.loadTotalBytes(au.churchId, req.body[0].fileType, req.body[0].contentId);
          if (totalBytes?.size > 100000000) return this.json({}, 401);
        }
        const decoded = req.body[0].fileContents ? Buffer.byteLength(req.body[0].fileContents.split(",").pop() || "", "base64") : 0;
        if (decoded > 26214400) return this.json({ error: "File too large" }, 400);
        try {
          const promises: Promise<File>[] = [];
          req.body.forEach((file) => {
            file.churchId = au.churchId;
            const f = file;
            const saveFunction = async () => {
              await this.saveFile(au.churchId, f, storage);
              return await this.repos.file.save(f);
            };
            promises.push(saveFunction());
          });
          const result = await Promise.all(promises);
          return result;
        } catch (e) {
          if (e instanceof QuotaExceededError) return this.json({ error: "storage_quota_exceeded", usedBytes: e.usedBytes, quotaBytes: e.quotaBytes }, 400);
          throw e;
        }
      }
    });
  }

  @httpPost("/postUrl")
  public async getUploadUrl(req: express.Request<{}, {}, { resourceId: string; fileName: string; contentType: string; contentId: string; size?: number; mimeType?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit) && au.groupIds.indexOf(req.body.contentId) === -1) return this.json({}, 401);
      else {
        const storage = await StorageResolver.forChurch(this.repos.storageProvider, au.churchId);
        if (storage.name === "churchapps") {
          const totalBytes = await this.repos.file.loadTotalBytes(au.churchId, req.body.contentType, req.body.contentId);
          if (totalBytes?.size > 100000000) return this.json({}, 401);
        }
        const safeName = path.basename(req.body.fileName).replace(/\.\.+/g, ".");
        let key = "/" + au.churchId + "/files/" + safeName;
        if (req.body.contentId) key = "/" + au.churchId + "/files/" + req.body.contentType + "/" + req.body.contentId + "/" + safeName;
        try {
          const result = await storage.provider.getUploadUrl(key, req.body.mimeType || "application/octet-stream", req.body.size || 0);
          return result || {};
        } catch (e) {
          if (e instanceof QuotaExceededError) return this.json({ error: "storage_quota_exceeded", usedBytes: e.usedBytes, quotaBytes: e.quotaBytes }, 400);
          throw e;
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
        const storage = StorageResolver.forUrl(existingFile.contentPath);
        await storage.provider.remove(au.churchId + "/files/" + existingFile.fileName);
        await this.repos.file.delete(au.churchId, id);
        return { file: au.churchId + "/files/" + existingFile.fileName };
      }
    });
  }

  private async saveFile(churchId: string, file: File, storage: { name: string; provider: IStorageProvider }) {
    // strip path separators and parent refs to prevent traversal
    file.fileName = path.basename(file.fileName).replace(/\.\.+/g, ".");
    const key = "/" + churchId + "/files/" + file.fileName;
    if (file.id) {
      // delete existing uploadFile; route to the provider that holds the old bytes
      const existingFile = await this.repos.file.load(file.churchId, file.id);
      const oldKey = "/" + churchId + "/files/" + existingFile.fileName;
      if (oldKey !== key) await StorageResolver.forUrl(existingFile.contentPath).provider.remove(oldKey);
    }

    if (file.fileContents) {
      const base64 = file.fileContents.split(",")[1];
      const buffer = Buffer.from(base64, "base64");
      await storage.provider.store(key, file.fileType, buffer);
    } else if (storage.provider.confirmUpload) {
      // presigned-upload flow: metadata registration confirms the object landed
      await storage.provider.confirmUpload(key);
    }

    const fileUpdated = new Date();
    file.contentPath = StorageResolver.publicUrl(storage.name, key) + "?dt=" + fileUpdated.getTime().toString();
    file.fileContents = null;
    return file;
  }
}
