import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import path from "path";
import { ContentBaseController } from "./ContentBaseController.js";
import { File } from "../models/index.js";
import { Environment, Permissions } from "../../../shared/helpers/index.js";
import { inferContentTypeFromKey, type IStorageProvider } from "@churchapps/apihelper";
import { StorageResolver } from "../helpers/StorageResolver.js";
import { BYOS_PROVIDERS } from "../helpers/ByosAuth.js";
import { QuotaExceededError } from "../helpers/MinistryStuffStorageProvider.js";
import { isPublicFile } from "../helpers/PublicFileAccess.js";

// Providers whose public URLs are short-lived; contentPath points at the stable /download route instead.
const REDIRECT_PROVIDERS = ["googledrive", "dropbox", "onedrive"];

// Arrangement audio: matches Planning Center's player-supported formats and keeps the free tier
// from taking WAV-sized files (4-10x an equivalent MP3). Free-tier ceiling; adjust here if needed.
const ARRANGEMENT_MAX_FILE_BYTES = 26214400;
const ARRANGEMENT_ALLOWED_MIME_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac"];

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
      if (!isPublicFile(file)) {
        const au = this.authUser();
        if (!au?.churchId || au.churchId !== file.churchId) return this.json({}, 401);
      }
      res.set("Cache-Control", isPublicFile(file) ? "public, max-age=300" : "private, no-store");
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
        if (req.body[0].contentType === "arrangement") {
          if (!ARRANGEMENT_ALLOWED_MIME_TYPES.includes(req.body[0].fileType || "")) return this.json({ error: "unsupported_audio_format" }, 400);
          if ((req.body[0].size || 0) > ARRANGEMENT_MAX_FILE_BYTES) return this.json({ error: "file_too_large" }, 400);
        }
        const storage = await StorageResolver.forChurch(this.repos.storageProvider, au.churchId);
        if (storage.name === "churchapps") {
          const totalBytes = await this.repos.file.loadTotalBytes(au.churchId, req.body[0].contentType, req.body[0].contentId);
          if (totalBytes?.size > 100000000) return this.json({}, 401);
        }
        const decoded = req.body[0].fileContents ? Buffer.byteLength(req.body[0].fileContents.split(",").pop() || "", "base64") : 0;
        if (decoded > 26214400) return this.json({ error: "file_too_large" }, 400);
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
          const detail = this.providerErrorDetail(e);
          if (detail && BYOS_PROVIDERS.includes(storage.name)) return this.json({ error: "storage_provider_error: " + detail }, 400);
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
        let size = req.body.size || 0;
        if (req.body.contentType === "arrangement") {
          if (!ARRANGEMENT_ALLOWED_MIME_TYPES.includes(req.body.mimeType || "")) return this.json({ error: "unsupported_audio_format" }, 400);
          if (size > ARRANGEMENT_MAX_FILE_BYTES) return this.json({ error: "file_too_large" }, 400);
          // an omitted size would otherwise fall through to the provider's generic upload cap
          size = size > 0 ? size : ARRANGEMENT_MAX_FILE_BYTES;
        }
        const storage = await StorageResolver.forChurch(this.repos.storageProvider, au.churchId);
        if (storage.name === "churchapps") {
          const totalBytes = await this.repos.file.loadTotalBytes(au.churchId, req.body.contentType, req.body.contentId);
          if (totalBytes?.size > 100000000) return this.json({}, 401);
        }
        const key = this.buildKey(au.churchId, req.body.contentType, req.body.contentId, req.body.fileName);
        try {
          // clients like FreeShow omit mimeType; infer from the key so zips presign as their real type
          const mimeType = req.body.mimeType || inferContentTypeFromKey(key) || "application/octet-stream";
          const result = await storage.provider.getUploadUrl(key, mimeType, size);
          return result || {};
        } catch (e) {
          if (e instanceof QuotaExceededError) return this.json({ error: "storage_quota_exceeded", usedBytes: e.usedBytes, quotaBytes: e.quotaBytes }, 400);
          const detail = this.providerErrorDetail(e);
          if (detail && BYOS_PROVIDERS.includes(storage.name)) return this.json({ error: "storage_provider_error: " + detail }, 400);
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
        const key = existingFile.externalId || StorageResolver.keyFromUrl(existingFile.contentPath);
        if (storage) await storage.provider.remove(key);
        await this.repos.file.delete(au.churchId, id);
        FileController.mintedUrlCache.delete(id);
        return { file: key };
      }
    });
  }

  // Surfaces the provider's own error text (Dropbox error_summary, Google/Microsoft error payloads) to the admin.
  private providerErrorDetail(e: any): string | null {
    const data = e?.response?.data;
    if (!data) return null;
    if (typeof data === "string") return data.substring(0, 300);
    const summary = data.error_summary || data.error?.message || data.error_description || (typeof data.error === "string" ? data.error : null);
    return summary && data.required_scope ? summary + " (required scope: " + data.required_scope + ")" : summary;
  }

  private buildKey(churchId: string, contentType: string, contentId: string, fileName: string): string {
    const safeName = path.basename(fileName).replace(/\.\.+/g, ".");
    if (contentId) return "/" + churchId + "/files/" + contentType + "/" + contentId + "/" + safeName;
    return "/" + churchId + "/files/" + safeName;
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
        const oldKey = StorageResolver.keyFromUrl(existingFile.contentPath);
        const newBytes = !!file.fileContents || !!uploadedExternalId;
        if (isByos && newBytes) {
          // church switched to BYOS after this file was uploaded; clean up the legacy bytes
          await StorageResolver.forUrl(existingFile.contentPath).provider.remove(oldKey);
        } else if (!isByos && oldKey !== StorageResolver.keyFromUrl(StorageResolver.publicUrl(storage.name, key))) {
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
