import { AuthenticatedUser, AwsHelper, FileStorageHelper } from "@churchapps/apihelper";
import express from "express";
import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import * as path from "path";
import * as crypto from "crypto";
import { Environment, Permissions } from "../helpers/index.js";
import { ContentBaseController } from "./ContentBaseController.js";

@controller("/content/gallery")
export class GalleryController extends ContentBaseController {
  // Group leaders can create and edit their group's calendar events (see EventController.save), and
  // the description editor's "Insert Image" button posts here, so they need the gallery too.
  // Deleting from the shared church gallery stays admin-only.
  private canUseGallery(au: AuthenticatedUser) {
    return au.checkAccess(Permissions.content.edit) || au.leaderGroupIds?.length > 0;
  }

  @httpGet("/stock/:folder")
  public async getStock(@requestParam("folder") folder: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => {
      const files = await FileStorageHelper.list("stockPhotos/" + path.basename(folder));
      return { images: files };
    });
  }

  @httpGet("/:folder")
  public async getAll(@requestParam("folder") folder: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.canUseGallery(au)) return this.json({}, 401);
      else {
        const prefix = au.churchId + "/gallery/" + path.basename(folder);
        const files = await FileStorageHelper.list(prefix);
        // The disk store lists bare file names; S3 lists full keys, which is what the gallery dialog expects.
        return { images: files.map((f: string) => (f.includes("/") ? f : prefix + "/" + f)) };
      }
    });
  }

  // Non-editors may only add images, under an unguessable name so they can't overwrite existing gallery images.
  private getUploadKey(au: AuthenticatedUser, folder: string, requestedName: string, contentType?: string): { key?: string; error?: string } {
    let fileName = path.basename(requestedName);
    if (!au.checkAccess(Permissions.content.edit)) {
      const ext = path.extname(fileName).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return { error: "Unsupported image type" };
      if (contentType && !/^image\/(jpeg|png|webp|gif)$/i.test(contentType)) return { error: "Unsupported image type" };
      fileName = path.basename(fileName, path.extname(fileName)) + "-" + crypto.randomBytes(6).toString("hex") + ext;
    }
    return { key: au.churchId + "/gallery/" + path.basename(folder) + "/" + fileName };
  }

  @httpPost("/requestUpload")
  public async getUploadUrl(req: express.Request<{}, {}, { folder: string; fileName: string; contentType?: string; size?: number }>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.canUseGallery(au)) return this.json({}, 401);
      else {
        const { key, error } = this.getUploadKey(au, req.body.folder, req.body.fileName, req.body.contentType);
        if (error) return this.json({ error }, 400);
        const result = Environment.fileStore === "S3" ? await AwsHelper.S3PresignedUrl(key, req.body.contentType, req.body.size) : {};
        return result;
      }
    });
  }

  // Disk-backed (self-hosted) installs have no presigned slot, so the gallery posts the image here instead.
  @httpPost("/upload")
  public async upload(req: express.Request<{}, {}, { folder: string; fileName: string; contentType: string; fileContents: string }>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.canUseGallery(au)) return this.json({}, 401);
      if (Environment.fileStore === "S3") return this.json({ error: "Use requestUpload" }, 400);
      const { key, error } = this.getUploadKey(au, req.body.folder, req.body.fileName, req.body.contentType);
      if (error) return this.json({ error }, 400);
      const contents = req.body.fileContents || "";
      const buffer = Buffer.from(contents.includes(",") ? contents.split(",")[1] : contents, "base64");
      if (buffer.length > 26214400) return this.json({ error: "file_too_large" }, 400);
      await FileStorageHelper.store(key, req.body.contentType, buffer);
      return { key };
    });
  }

  @httpDelete("/:folder/:image")
  public async delete(@requestParam("folder") folder: string, @requestParam("image") image: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await FileStorageHelper.remove(au.churchId + "/gallery/" + path.basename(folder) + "/" + path.basename(image));
        return this.json({});
      }
    });
  }
}
