import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import path from "path";
import { ContentBaseController } from "./ContentBaseController.js";
import { File } from "../models/index.js";
import { Environment, Permissions } from "../../../shared/helpers/index.js";
import type { IStorageProvider } from "@churchapps/apihelper";
import { StorageResolver } from "../helpers/StorageResolver.js";
import { BYOS_PROVIDERS } from "../helpers/ByosAuth.js";
import { QuotaExceededError } from "../helpers/MinistryStuffStorageProvider.js";

// Providers whose public URLs are short-lived; contentPath points at the stable /download route instead.
const REDIRECT_PROVIDERS = ["googledrive", "dropbox", "onedrive"];

@controller("/content/files")
export class FileController extends ContentBaseController {
  // Minted provider links live >=1h; cache them so page loads don't hammer the provider APIs.
  private static mintedUrlCache = new Map<string, { url: string; expires: number }>();
  private static MINT_CACHE_MS = 30 * 60 * 1000;

  @httpGet("/download/:id")
  public async download(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const file = await this.repos.file.loadById(id);
      if (!file) return this.json({}, 404);
      res.set("Cache-Control", "public, max-age=300");
      if (!file.provider || !file.externalId) {
        res.redirect(302, file.contentPath);
        return;
      }
      const cached = FileController.mintedUrlCache.get(id);
      if (cached && cached.expires > Date.now()) {
        res.redirect(302, cached.url);
        return;
      }
      const storage = await StorageResolver.forFile(this.repos.storageProvider, file);
      const url = storage?.provider.getDownloadUrl ? await storage.provider.getDownloadUrl(file.externalId) : null;
      if (!url) return this.json({}, 404);
      FileController.mintedUrlCache.set(id, { url, expires: Date.now() + FileController.MINT_CACHE_MS });
      res.redirect(302, url);
    });
  }

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
          const totalBytes = await this.repos.file.loadTotalBytes(au.churchId, req.body[0].contentType, req.body[0].contentId);
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
              let result = await this.repos.file.save(f);
              // redirect-provider urls embed the file id, which doesn't exist until the first save
              if (REDIRECT_PROVIDERS.includes(f.provider || "")) {
                f.contentPath = Environment.contentApi + "/files/download/" + result.id + "?dt=" + Date.now().toString();
                FileController.mintedUrlCache.delete(result.id);
                result = await this.repos.file.save(f);
              }
              return result;
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
        const key = this.buildKey(au.churchId, req.body.contentType, req.body.contentId, req.body.fileName);
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
        const storage = await StorageResolver.forFile(this.repos.storageProvider, existingFile);
        const key = existingFile.externalId || this.keyFromUrl(existingFile.contentPath);
        if (storage) await storage.provider.remove(key);
        await this.repos.file.delete(au.churchId, id);
        FileController.mintedUrlCache.delete(id);
        return { file: key };
      }
    });
  }

  private buildKey(churchId: string, contentType: string, contentId: string, fileName: string): string {
    const safeName = path.basename(fileName).replace(/\.\.+/g, ".");
    if (contentId) return "/" + churchId + "/files/" + contentType + "/" + contentId + "/" + safeName;
    return "/" + churchId + "/files/" + safeName;
  }

  // Legacy files (no externalId): the true storage key is whatever the public URL serves.
  private keyFromUrl(contentPath: string): string {
    const base = (contentPath || "").split("?")[0];
    const roots = [Environment.contentRoot, Environment.ministryStuffContentRoot].filter((r) => r);
    for (const root of roots) {
      const trimmed = root.replace(/\/$/, "");
      if (base.startsWith(trimmed)) return base.substring(trimmed.length);
    }
    return base;
  }

  private async saveFile(churchId: string, file: File, storage: { name: string; provider: IStorageProvider }) {
    // strip path separators and parent refs to prevent traversal
    file.fileName = path.basename(file.fileName).replace(/\.\.+/g, ".");
    const key = this.buildKey(churchId, file.contentType, file.contentId, file.fileName);
    const isByos = BYOS_PROVIDERS.includes(storage.name);
    // presigned BYOS uploads always register an externalId; its presence distinguishes new bytes from a rename
    const uploadedExternalId = file.externalId;
    // provider/externalId are server-owned; re-derived below from storage + the existing row
    file.provider = null;
    file.externalId = null;
    let existingFile: File | undefined;
    if (file.id) {
      existingFile = await this.repos.file.load(file.churchId, file.id);
      if (existingFile?.provider) {
        file.provider = existingFile.provider;
        file.externalId = uploadedExternalId || existingFile.externalId;
        // re-upload landed a new provider object (Drive ids change per upload); drop the old one
        if (uploadedExternalId && existingFile.externalId && uploadedExternalId !== existingFile.externalId) {
          const old = await StorageResolver.forFile(this.repos.storageProvider, existingFile);
          if (old) await old.provider.remove(existingFile.externalId);
        }
      } else if (existingFile) {
        const oldKey = this.keyFromUrl(existingFile.contentPath);
        const newBytes = !!file.fileContents || !!uploadedExternalId;
        if (isByos && newBytes) {
          // church switched to BYOS after this file was uploaded; clean up the legacy bytes
          await StorageResolver.forUrl(existingFile.contentPath).provider.remove(oldKey);
        } else if (!isByos && oldKey !== this.keyFromUrl(StorageResolver.publicUrl(storage.name, key))) {
          // delete existing uploadFile; route to the provider that holds the old bytes
          await StorageResolver.forUrl(existingFile.contentPath).provider.remove(oldKey);
        }
      }
    }

    if (file.fileContents) {
      const base64 = file.fileContents.split(",")[1];
      const buffer = Buffer.from(base64, "base64");
      const stored = await storage.provider.store(key, file.fileType, buffer);
      if (isByos) {
        file.provider = storage.name;
        file.externalId = stored;
      }
    } else if (isByos && uploadedExternalId) {
      file.provider = storage.name;
      file.externalId = uploadedExternalId;
      if (storage.provider.confirmUpload) await storage.provider.confirmUpload(file.externalId);
    } else if (!isByos && storage.provider.confirmUpload) {
      // presigned-upload flow: metadata registration confirms the object landed
      await storage.provider.confirmUpload(key);
    }

    const fileUpdated = new Date();
    if (REDIRECT_PROVIDERS.includes(file.provider || "")) {
      // stable /download url embeds the row id; written in save() once the id exists
    } else if (file.provider === "s3") {
      if (storage.name === "s3" && storage.provider.getDownloadUrl && file.externalId) file.contentPath = (await storage.provider.getDownloadUrl(file.externalId)) + "?dt=" + fileUpdated.getTime().toString();
    } else {
      file.contentPath = StorageResolver.publicUrl(storage.name, key) + "?dt=" + fileUpdated.getTime().toString();
    }
    file.fileContents = null;
    return file;
  }
}
