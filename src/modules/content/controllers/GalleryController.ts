import { AwsHelper, FileStorageHelper } from "@churchapps/apihelper";
import express from "express";
import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import { Environment, Permissions } from "../helpers";
import { ContentBaseController } from "./ContentBaseController";

@controller("/content/gallery")
export class GalleryController extends ContentBaseController {
  @httpGet("/stock/:folder")
  public async getStock(
    @requestParam("folder") folder: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const files = await FileStorageHelper.list("stockPhotos/" + folder);
      return { images: files };
    });
  }

  @httpGet("/:folder")
  public async getAll(
    @requestParam("folder") folder: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const files = await FileStorageHelper.list(au.churchId + "/gallery/" + folder);
        return { images: files };
      }
    });
  }

  @httpPost("/requestUpload")
  public async getUploadUrl(
    req: express.Request<{}, {}, { folder: string; fileName: string }>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      console.log("User Is", au.firstName);
      console.log("Permissions", au.permissions);
      console.log("User Has Access", au.checkAccess(Permissions.content.edit));

      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const key = au.churchId + "/gallery/" + req.body.folder + "/" + req.body.fileName;
        const result = Environment.fileStore === "S3" ? await AwsHelper.S3PresignedUrl(key) : {};
        return result;
      }
    });
  }

  @httpDelete("/:folder/:image")
  public async delete(
    @requestParam("folder") folder: string,
    @requestParam("image") image: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await FileStorageHelper.remove(au.churchId + "/gallery/" + folder + "/" + image);
        return this.json({});
      }
    });
  }
}
