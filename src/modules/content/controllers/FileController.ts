import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import path from "path";
import { ContentBaseController } from "./ContentBaseController.js";
import { File } from "../models/index.js";
import { Environment, Permissions } from "../../../shared/helpers/index.js";
import { AuthenticatedUser, EnvironmentBase, inferContentTypeFromKey, resolveMaxUploadBytes, type IStorageProvider } from "@churchapps/apihelper";
// hoisted transitive dep of @churchapps/apihelper
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { S3Client } from "@aws-sdk/client-s3";
import { StorageResolver } from "../helpers/StorageResolver.js";
import { GoogleDriveStorageProvider } from "../helpers/GoogleDriveStorageProvider.js";
import { BYOS_PROVIDERS } from "../helpers/ByosAuth.js";
import { QuotaExceededError } from "../helpers/MinistryStuffStorageProvider.js";
import { isPublicFile, isPrivateFile } from "../helpers/PublicFileAccess.js";
import { PersonFileStorage, PERSON_CONTENT_TYPE, PERSON_MAX_TOTAL_BYTES } from "../helpers/PersonFileStorage.js";

// Providers whose public URLs are short-lived; contentPath points at the stable /download route instead.
const REDIRECT_PROVIDERS = ["googledrive", "dropbox", "onedrive"];

// Arrangement audio: browser-playable compressed formats only, which keeps the free tier from taking
// WAV-sized files (4-10x an equivalent MP3). Free-tier ceiling; adjust here if needed.
const ARRANGEMENT_MAX_FILE_BYTES = 26214400;
const ARRANGEMENT_ALLOWED_MIME_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac"];
// A chord chart PDF beside the audio. It is sent inline, never presigned, so the bytes can be checked
// before they are stored; 4 MB keeps the base64 body under the Lambda's 6 MB request limit.
const ARRANGEMENT_PDF_MIME_TYPE = "application/pdf";
const ARRANGEMENT_PDF_MAX_FILE_BYTES = 4194304;

const arrangementUploadError = (fileType: string | undefined, size: number, fileName: string | undefined): string | null => {
  if (fileType === ARRANGEMENT_PDF_MIME_TYPE) {
    if (!/\.pdf$/i.test(fileName || "")) return "invalid_pdf";
    return size > ARRANGEMENT_PDF_MAX_FILE_BYTES ? "pdf_too_large" : null;
  }
  if (!ARRANGEMENT_ALLOWED_MIME_TYPES.includes(fileType || "")) return "unsupported_audio_format";
  return size > ARRANGEMENT_MAX_FILE_BYTES ? "file_too_large" : null;
};

const arrangementPdfError = (fileContents: string | undefined): string | null => {
  if (!fileContents) return "invalid_pdf";
  const bytes = Buffer.from(fileContents.split(",").pop() || "", "base64");
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return "invalid_pdf";
  return bytes.length > ARRANGEMENT_PDF_MAX_FILE_BYTES ? "pdf_too_large" : null;
};

// Group members upload to the public CDN; never let them serve active content from it.
const ACTIVE_MIME_TYPES = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/(x-)?javascript|application\/ecmascript|text\/ecmascript)/i;
const safeMemberMimeType = (mimeType: string) => (!mimeType || ACTIVE_MIME_TYPES.test(mimeType.trim()) ? "application/octet-stream" : mimeType);

// Shape of an axios-style error from a storage provider (Dropbox, Google, Microsoft) as read by providerErrorDetail.
interface ProviderHttpError {
  response?: {
    data?: string | {
      error_summary?: string;
      error?: string | { message?: string };
      error_description?: string;
      required_scope?: string;
    };
  };
}

@controller("/content/files")
export class FileController extends ContentBaseController {
  // Minted provider links live >=1h; cache them so page loads don't hammer the provider APIs.
  private static mintedUrlCache = new Map<string, { url: string; expires: number }>();
  private static MINT_CACHE_MS = 30 * 60 * 1000;

  @httpGet("/download/:id")
  public async download(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => {
      const file = await this.repos.file.loadById(id);
      if (!file) return this.json({}, 404);
      if (isPrivateFile(file)) return this.downloadPrivate(file, req, res);
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
      if (FileController.mintedUrlCache.size > 1000) FileController.mintedUrlCache.clear();
      FileController.mintedUrlCache.set(id, { url, expires: Date.now() + FileController.MINT_CACHE_MS });
      res.redirect(302, url);
    });
  }

  // Private files are never served from the raw route; staff with access get a short-lived signed link instead.
  @httpGet("/download/:id/link")
  public async downloadLink(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const file = await this.repos.file.load(au.churchId, id);
      if (!file) return this.json({}, 404);
      if (!isPrivateFile(file)) return { url: file.contentPath };
      if (!au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      return { url: PersonFileStorage.signLink(file.id) };
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const file = await this.repos.file.load(au.churchId, id);
      if (isPrivateFile(file) && !au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      return file;
    });
  }

  @httpGet("/:contentType/:contentId")
  public async getByContent(@requestParam("contentType") contentType: string, @requestParam("contentId") contentId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (isPrivateFile({ contentType }) && !au.checkAccess(Permissions.people.view)) return this.json({}, 401);
      return await this.repos.file.loadForContent(au.churchId, contentType, contentId);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.file.loadForWebsite(au.churchId);
    });
  }

  // Known bug - This post accepts multiple File modals but only a single file upload.  It's not a problem because the app restricts users to one upload at a time (for now).
  @httpPost("/")
  public async save(req: express.Request<{}, {}, File[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (Array.isArray(req.body) && req.body.some((f) => isPrivateFile(f))) return this.savePersonFiles(au, req.body);
      const isEditor = au.checkAccess(Permissions.content.edit);
      if (!isEditor && !(await this.canGroupMemberSave(au, req.body))) {
        return this.json({}, 401);
      } else {
        if (!isEditor) for (const f of req.body) f.fileType = safeMemberMimeType(f.fileType);
        for (const f of req.body.filter((x) => x.contentType === "arrangement")) {
          const error = arrangementUploadError(f.fileType, f.size || 0, f.fileName) || (f.fileType === ARRANGEMENT_PDF_MIME_TYPE ? arrangementPdfError(f.fileContents) : null);
          if (error) return this.json({ error }, 400);
        }
        const storage = await StorageResolver.forChurch(this.repos.storageProvider, au.churchId);
        if (storage.name === "churchapps") {
          const totalBytes = await this.repos.file.loadTotalBytes(au.churchId, req.body[0].contentType, req.body[0].contentId);
          if (totalBytes?.size > 100000000) return this.json({}, 401);
        }
        const decoded = req.body[0].fileContents ? Buffer.byteLength(req.body[0].fileContents.split(",").pop() || "", "base64") : 0;
        if (decoded > 26214400) return this.json({ error: "file_too_large" }, 400);
        if (req.body[0].fileContents) req.body[0].size = decoded;
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
  public async getUploadUrl(req: express.Request<{}, {}, { resourceId: string; fileName: string; contentType: string; contentId: string; size?: number; mimeType?: string }>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (isPrivateFile(req.body)) return this.personUploadUrl(au, req.body);
      const isEditor = au.checkAccess(Permissions.content.edit);
      if (!isEditor && (au.groupIds.indexOf(req.body.contentId) === -1 || req.body.contentType !== "group")) return this.json({}, 401);
      else {
        let size = req.body.size || 0;
        if (req.body.contentType === "arrangement") {
          const error = arrangementUploadError(req.body.mimeType, size, req.body.fileName);
          if (error) return this.json({ error }, 400);
          // no presign: the client falls back to an inline upload that save() can inspect
          if (req.body.mimeType === ARRANGEMENT_PDF_MIME_TYPE) return {};
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
          const inferred = req.body.mimeType || inferContentTypeFromKey(key) || "application/octet-stream";
          const mimeType = isEditor ? inferred : safeMemberMimeType(inferred);
          let result;
          if (this.isFreeShowSync(req.body) && storage.name === "churchapps") result = await this.freeShowPresignedUrl(key, size);
          else if (this.isSyncFile(req.body) && storage.provider instanceof GoogleDriveStorageProvider) result = await storage.provider.getReplaceUploadUrl(key, mimeType, size);
          else result = await storage.provider.getUploadUrl(key, mimeType, size);
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

  // Where a team's FreeShow sync zip lives. external=false: the platform content host at the usual
  // /{churchId}/files/group/{teamId}/{fileName} path. external=true: the church's own storage, with the url
  // and md5/modified markers to use instead (url absent until the first upload lands).
  @httpGet("/sync/:teamId/:fileName")
  public async syncFileInfo(@requestParam("teamId") teamId: string, @requestParam("fileName") fileName: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const body = { contentType: "group", contentId: teamId, fileName };
      if (!this.isSyncFile(body)) return this.json({ error: "unsupported_file" }, 400);
      if (!au.checkAccess(Permissions.content.edit) && au.groupIds.indexOf(teamId) === -1) return this.json({}, 401);
      const storage = await StorageResolver.forChurch(this.repos.storageProvider, au.churchId);
      if (!(storage.provider instanceof GoogleDriveStorageProvider)) return { external: false };
      try {
        const info = await storage.provider.getKeyedFileInfo(this.buildKey(au.churchId, "group", teamId, fileName));
        return { external: true, ...(info || {}) };
      } catch (e) {
        const detail = this.providerErrorDetail(e);
        if (detail) return this.json({ error: "storage_provider_error: " + detail }, 400);
        throw e;
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const existingFile = await this.repos.file.load(au.churchId, id);
      if (!existingFile) return this.json({}, 404);
      if (isPrivateFile(existingFile)) {
        if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
        const key = existingFile.externalId || this.buildKey(au.churchId, existingFile.contentType, existingFile.contentId, existingFile.fileName);
        await PersonFileStorage.remove(key);
        await this.repos.file.delete(au.churchId, id);
        return { file: key };
      }
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

  // Person documents: Edit People only, always new rows, private bytes on the default store.
  private async savePersonFiles(au: AuthenticatedUser, files: File[]): Promise<unknown> {
    if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
    if (!files.every((f) => f.contentType === PERSON_CONTENT_TYPE && PersonFileStorage.isValidPersonId(f.contentId) && f.fileName)) return this.json({ error: "invalid_file" }, 400);
    const results: File[] = [];
    for (const f of files) {
      const decoded = f.fileContents ? Buffer.byteLength(f.fileContents.split(",").pop() || "", "base64") : 0;
      if (decoded > 26214400) return this.json({ error: "file_too_large" }, 400);
      if (f.fileContents) f.size = decoded;
      const totalBytes = await this.repos.file.loadTotalBytes(au.churchId, f.contentType, f.contentId);
      const usedBytes = totalBytes?.size || 0;
      if (usedBytes + (f.size || 0) > PERSON_MAX_TOTAL_BYTES) return this.json({ error: "storage_quota_exceeded", usedBytes, quotaBytes: PERSON_MAX_TOTAL_BYTES }, 400);
      f.id = undefined;
      f.churchId = au.churchId;
      f.fileName = path.basename(f.fileName).replace(/\.\.+/g, ".");
      const key = this.buildKey(au.churchId, f.contentType, f.contentId, f.fileName);
      if (f.fileContents) await PersonFileStorage.store(key, f.fileType || "application/octet-stream", Buffer.from(f.fileContents.split(",").pop() || "", "base64"));
      else if (EnvironmentBase.fileStore !== "S3") return this.json({ error: "invalid_file" }, 400);
      f.fileContents = null;
      f.provider = null;
      f.externalId = key;
      f.contentPath = "";
      const saved = await this.repos.file.save(f);
      saved.contentPath = Environment.contentApi + "/files/download/" + saved.id;
      results.push(await this.repos.file.save(saved));
    }
    return results;
  }

  private async personUploadUrl(au: AuthenticatedUser, body: { fileName: string; contentType: string; contentId: string; size?: number; mimeType?: string }): Promise<unknown> {
    if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
    if (!PersonFileStorage.isValidPersonId(body.contentId) || !body.fileName) return this.json({ error: "invalid_file" }, 400);
    const totalBytes = await this.repos.file.loadTotalBytes(au.churchId, body.contentType, body.contentId);
    const usedBytes = totalBytes?.size || 0;
    if (usedBytes + (body.size || 0) > PERSON_MAX_TOTAL_BYTES) return this.json({ error: "storage_quota_exceeded", usedBytes, quotaBytes: PERSON_MAX_TOTAL_BYTES }, 400);
    const key = this.buildKey(au.churchId, body.contentType, body.contentId, body.fileName);
    const mimeType = body.mimeType || inferContentTypeFromKey(key) || "application/octet-stream";
    return (await PersonFileStorage.getUploadUrl(key, mimeType, body.size || 0)) || {};
  }

  // Signed link only: the browser opens it directly, so it carries no JWT.
  private async downloadPrivate(file: File, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    const query: express.Request["query"] = req.query || {};
    if (!PersonFileStorage.verifyLink(file.id, query.exp?.toString(), query.sig?.toString())) return this.json({}, 401);
    res.set("Cache-Control", "private, no-store");
    const key = file.externalId || this.buildKey(file.churchId, file.contentType, file.contentId, file.fileName);
    if (EnvironmentBase.fileStore === "S3") {
      res.redirect(302, await PersonFileStorage.s3DownloadUrl(key, file.fileName));
      return;
    }
    const contents = PersonFileStorage.readLocal(key);
    if (!contents) return this.json({}, 404);
    res.set("Content-Type", file.fileType || "application/octet-stream");
    res.set("Content-Disposition", PersonFileStorage.contentDisposition(file.fileName));
    res.set("X-Content-Type-Options", "nosniff");
    res.send(contents);
  }

  private async canGroupMemberSave(au: AuthenticatedUser, files: File[]): Promise<boolean> {
    if (!Array.isArray(files) || files.length === 0) return false;
    for (const file of files) {
      if (au.groupIds.indexOf(file.contentId) === -1 || file.contentType !== "group") return false;
      if (file.id) {
        const existing = await this.repos.file.load(au.churchId, file.id);
        if (!existing || au.groupIds.indexOf(existing.contentId) === -1) return false;
      }
    }
    return true;
  }

  // Surfaces the provider's own error text (Dropbox error_summary, Google/Microsoft error payloads) to the admin.
  private providerErrorDetail(e: unknown): string | null {
    const data = (e as ProviderHttpError | undefined)?.response?.data;
    if (!data) return null;
    if (typeof data === "string") return data.substring(0, 300);
    const summary = data.error_summary || (data.error as { message?: string })?.message || data.error_description || (typeof data.error === "string" ? data.error : null);
    return summary && data.required_scope ? summary + " (required scope: " + data.required_scope + ")" : summary;
  }

  private isFreeShowSync(body: { fileName: string; contentType: string; mimeType?: string }): boolean {
    return body.contentType === "group" && !body.mimeType && ["current.zip", "previous.zip"].includes(path.basename(body.fileName || ""));
  }

  // FreeShow's per-team sync state: one file per name that each sync overwrites, whatever the client sends as mimeType.
  private isSyncFile(body: { fileName: string; contentType: string }): boolean {
    return body.contentType === "group" && ["current.zip", "previous.zip"].includes(path.basename(body.fileName || ""));
  }

  // Temp patch for FreeShow double appending content type and public read.
  private async freeShowPresignedUrl(key: string, size?: number): Promise<{ url: string; fields: Record<string, string>; key: string } | null> {
    if (EnvironmentBase.fileStore !== "S3") return null;
    if (key.startsWith("/")) key = key.substring(1);
    const config = process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {};
    const { url, fields } = await createPresignedPost(new S3Client(config), {
      Bucket: EnvironmentBase.s3Bucket,
      Key: key,
      Conditions: [
        ["eq", "$Content-Type", "application/zip"],
        ["content-length-range", 1, resolveMaxUploadBytes(size)],
        { acl: "public-read" }
      ],
      Expires: 3600
    });
    return { url, fields, key };
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
