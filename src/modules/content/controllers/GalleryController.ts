import { AwsHelper, FileStorageHelper } from "@churchapps/apihelper";
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
  private canUseGallery(au: any) {
    return au.checkAccess(Permissions.content.edit) || au.leaderGroupIds?.length > 0;
  }

  @httpGet("/stock/:folder")
  public async getStock(@requestParam("folder") folder: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const files = await FileStorageHelper.list("stockPhotos/" + path.basename(folder));
      return { images: files };
    });
  }

  @httpGet("/:folder")
  public async getAll(@requestParam("folder") folder: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.canUseGallery(au)) return this.json({}, 401);
      else {
        const files = await FileStorageHelper.list(au.churchId + "/gallery/" + path.basename(folder));
        return { images: files };
      }
    });
  }

  @httpPost("/requestUpload")
  public async getUploadUrl(req: express.Request<{}, {}, { folder: string; fileName: string; contentType?: string; size?: number }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.canUseGallery(au)) return this.json({}, 401);
      else {
        let fileName = path.basename(req.body.fileName);
        if (!au.checkAccess(Permissions.content.edit)) {
          const ext = path.extname(fileName).toLowerCase();
          if (![".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return this.json({ error: "Unsupported image type" }, 400);
          if (req.body.contentType && !/^image\/(jpeg|png|webp|gif)$/i.test(req.body.contentType)) return this.json({ error: "Unsupported image type" }, 400);
          // non-editors get an unguessable key so they can't overwrite existing gallery images
          fileName = path.basename(fileName, path.extname(fileName)) + "-" + crypto.randomBytes(6).toString("hex") + ext;
        }
        const key = au.churchId + "/gallery/" + path.basename(req.body.folder) + "/" + fileName;
        const result = Environment.fileStore === "S3" ? await AwsHelper.S3PresignedUrl(key, req.body.contentType, req.body.size) : {};
        return result;
      }
    });
  }

  @httpDelete("/:folder/:image")
  public async delete(@requestParam("folder") folder: string, @requestParam("image") image: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await FileStorageHelper.remove(au.churchId + "/gallery/" + path.basename(folder) + "/" + path.basename(image));
        return this.json({});
      }
    });
  }
}
