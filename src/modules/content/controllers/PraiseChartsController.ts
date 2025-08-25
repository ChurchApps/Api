import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController";
import { Setting } from "../models";
import { PraiseChartsHelper } from "../helpers/PraiseChartsHelper";
import * as path from "path";
import * as fs from "fs";
import { AwsHelper } from "@churchapps/apihelper";

@controller("/content/praiseCharts")
export class PraiseChartsController extends ContentBaseController {
  @httpGet("/raw/:id")
  public async raw(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      return PraiseChartsHelper.loadRaw(id);
    });
  }

  @httpGet("/hasAccount")
  public async hasPraiseChartsAccount(@requestParam("id") _id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { token } = await PraiseChartsHelper.loadUserTokens(au);
      if (token) return { hasAccount: true };
      else return { hasAccount: false };
    });
  }

  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      const query = req.query.q as string;
      const results = await PraiseChartsHelper.search(query);
      return results;
    });
  }

  @httpGet("/products/:id")
  public async products(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { token, secret } = await PraiseChartsHelper.loadUserTokens(au);
      const keys = req.query.keys ? req.query.keys.toString().split(",") : [];
      const data = token ? await PraiseChartsHelper.loadSongFromLibrary(id, keys, token, secret) : await PraiseChartsHelper.loadSongFromCatalog(id, keys);
      let products = [];
      if (data.in_library?.items?.length > 0) products = data.in_library?.items[0].products;
      else if (data.other_results?.items?.length > 0) products = data.other_results?.items[0].products;
      else if (data.arrangements?.items?.length > 0) products = data.arrangements.items[0].products;
      return products;
    });
  }

  @httpGet("/arrangement/raw/:id")
  public async arrangement(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { token, secret } = await PraiseChartsHelper.loadUserTokens(au);
      const keys = req.query.keys ? req.query.keys.toString().split(",") : [];
      if (!token) return { error: "No access token" };
      const result = await PraiseChartsHelper.loadArrangmentRaw(id, keys, token, secret);
      return result;
    });
  }

  static async saveLocalFile(fileName: string, fileBuffer: any) {
    const publicDownloadsDir = path.join(__dirname, "..", "public", "downloads", "praiseCharts");
    const filePath = path.join(publicDownloadsDir, fileName);
    fs.mkdirSync(publicDownloadsDir, { recursive: true });
    fs.writeFileSync(filePath, fileBuffer);
    return `/public/downloads/praiseCharts/${fileName}`;
  }

  static async saveS3File(fileName: string, mimeType: string, fileBuffer: any) {
    const pathName = `/downloads/praiseCharts/${fileName}`;
    await AwsHelper.S3Upload(pathName, mimeType, fileBuffer);
    return pathName;
  }

  @httpGet("/download")
  public async download(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const settings: Setting[] = await this.repositories.setting.loadUser(au.churchId, au.id);
      const token = settings.find((s) => s.keyName === "praiseChartsAccessToken")?.value;
      const secret = settings.find((s) => s.keyName === "praiseChartsAccessTokenSecret")?.value;
      const fileBuffer: any = await PraiseChartsHelper.download(req.query.skus.toString().split(","), req.query.keys.toString().split(","), token, secret);

      let fileName = "praisecharts.pdf";
      if (req.query.file_name) {
        fileName = req.query.file_name.toString();
      }
      let mimeType = "application/pdf";
      const fileType = fileName.split(".")[1].toLowerCase();
      switch (fileType) {
        case "zip":
          mimeType = "application/zip";
          break;
      }

      // Ensure the file buffer is properly handled for both PDF and ZIP
      const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);

      const redirectUrl = process.env.SERVER_PORT ? await PraiseChartsController.saveLocalFile(fileName, buffer) : await PraiseChartsController.saveS3File(fileName, mimeType, buffer);

      return { redirectUrl };
    });
  }

  @httpGet("/authUrl")
  public async praiseChartsAuthUrl(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const returnUrl = req.query.returnUrl as string;
      const { oauthToken, oauthTokenSecret } = await PraiseChartsHelper.getRequestToken(returnUrl);
      let authUrl = PraiseChartsHelper.getAuthorizeUrl(oauthToken);
      authUrl += "&XID=churchapps";
      return { authUrl, oauthToken, oauthTokenSecret };
    });
  }

  @httpGet("/access")
  public async praiseChartsTest(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const verifier = req.query.verifier as string;
      const token = req.query.token as string;
      const secret = req.query.secret as string;
      const result = await PraiseChartsHelper.getAccessToken(token, secret, verifier);

      const settings: Setting[] = [
        { keyName: "praiseChartsAccessToken", value: result.accessToken, userId: au.id, churchId: au.churchId },
        {
          keyName: "praiseChartsAccessTokenSecret",
          value: result.accessTokenSecret,
          userId: au.id,
          churchId: au.churchId
        }
      ];

      await this.repositories.setting.saveAll(settings);

      return result;
    });
  }

  @httpGet("/library")
  public async praiseChartsCatalog(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const settings: Setting[] = await this.repositories.setting.loadUser(au.churchId, au.id);
      const token = settings.find((s) => s.keyName === "praiseChartsAccessToken")?.value;
      const secret = settings.find((s) => s.keyName === "praiseChartsAccessTokenSecret")?.value;

      const result = await PraiseChartsHelper.searchLibraryAuth("", token, secret);

      return result;
    });
  }
}
