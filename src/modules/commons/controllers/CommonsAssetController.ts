import { controller, httpDelete, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import * as crypto from "crypto";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { assetSubmitError, ContentLibraryHelper, recordAssetDownload } from "../helpers/index.js";
import { Asset } from "../models/index.js";

interface AssetSubmission extends Asset {
  file?: { name?: string; contentType?: string; base64?: string };
  thumb?: { name?: string; contentType?: string; base64?: string };
}

@controller("/commons/assets")
export class CommonsAssetController extends CommonsBaseController {
  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => await this.repos.asset.search({
      assetType: req.query.assetType?.toString(),
      tags: req.query.tags?.toString(),
      language: req.query.language?.toString(),
      q: req.query.q?.toString(),
      sort: req.query.sort?.toString(),
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 50
    }));
  }

  @httpGet("/mine")
  public async mine(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      return await this.repos.asset.loadByPublisher(au.id);
    });
  }

  @httpPost("/")
  public async submit(req: express.Request<{}, {}, AssetSubmission>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in to share an asset"] }, 401);
      const body = req.body;
      const buffer = Buffer.from(body.file?.base64 || "", "base64");
      const error = assetSubmitError(body, buffer.length);
      if (error) return this.json({ errors: [error] }, 400);

      const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");
      if (await this.repos.asset.loadByHash(contentHash)) return this.json({ errors: ["An identical asset has already been submitted"] }, 409);

      const asset: Asset = {
        assetType: body.assetType,
        name: body.name,
        description: body.description,
        tags: body.tags,
        language: body.language || "English",
        license: body.license,
        publisherUserId: au.id,
        publisherChurchId: au.churchId,
        status: "pending",
        sizeBytes: buffer.length,
        contentHash,
        version: body.version,
        appMinVersion: body.appMinVersion
      };
      await this.repos.asset.create(asset);

      const folder = ContentLibraryHelper.assetPendingFolderKey(asset.id);
      const contentPath = `${folder}/${CommonsAssetController.safeName(body.file?.name, "asset")}`;
      const updates: Partial<Asset> = { contentPath };
      await ContentLibraryHelper.storePending(contentPath, body.file?.contentType || "application/octet-stream", buffer);
      if (body.thumb?.base64) {
        const thumb = Buffer.from(body.thumb.base64, "base64");
        if (thumb.length > 0 && thumb.length <= 2097152) {
          const thumbPath = `${folder}/${CommonsAssetController.safeName(body.thumb.name, "thumb")}`;
          updates.thumbPath = thumbPath;
          await ContentLibraryHelper.storePending(thumbPath, body.thumb.contentType || "image/png", thumb);
        }
      }
      await this.repos.asset.update(asset.id, updates);
      return { ...asset, ...updates };
    });
  }

  @httpGet("/:id")
  public async get(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const asset = await this.repos.asset.loadApproved(String(req.params.id));
      if (!asset) return this.json({}, 404);
      return asset;
    });
  }

  @httpPost("/:id/download")
  public async download(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const asset = await this.repos.asset.loadApproved(String(req.params.id));
      if (!asset) return this.json({}, 404);
      const downloadCount = await recordAssetDownload(this.repos.asset, asset, req);
      // song assets carry no contentPath - their files are served from the library folder
      if (!asset.contentPath) return { downloadCount };
      const key = ContentLibraryHelper.storageKey(asset.contentPath);
      return { url: key ? ContentLibraryHelper.publicUrl(key) : asset.contentPath, downloadCount };
    });
  }

  // authz-exempt: likes are keyed by au.id, so a signed-in user can only toggle their own
  @httpPost("/:id/like")
  public async like(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      const asset = await this.repos.asset.loadApproved(String(req.params.id));
      if (!asset) return this.json({}, 404);
      return await this.repos.asset.toggleLike(asset.id, au.id);
    });
  }

  @httpDelete("/:id")
  public async delete(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset) return this.json({}, 404);
      if (!au.id || asset.publisherUserId !== au.id) return this.json({}, 401);
      await ContentLibraryHelper.removeAssetObjects(asset);
      await this.repos.asset.delete(asset.id);
      return { deleted: true };
    });
  }

  private static safeName(name: string | undefined, fallback: string): string {
    return (name || fallback).replace(/[^a-zA-Z0-9._-]/g, "_");
  }
}
