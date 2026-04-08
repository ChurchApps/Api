import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { Permissions } from "../helpers/index.js";
import { ContentBaseController } from "./ContentBaseController.js";
import { GlobalStyle } from "../models/index.js";

@controller("/content/globalStyles")
export class GlobalStyleController extends ContentBaseController {
  defaultStyle: GlobalStyle = {
    fonts: JSON.stringify({ body: "Roboto", heading: "Roboto" }),
    palette: JSON.stringify({
      light: "#FFFFFF",
      lightAccent: "#DDDDDD",
      accent: "#0000DD",
      darkAccent: "#9999DD",
      dark: "#000000"
    }),
    customCss: "",
    customJS: ""
  };

  // Anonymous access
  @httpGet("/church/:churchId")
  public async loadAnon(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const result = await this.repos.globalStyle.loadForChurch(churchId);
      return result || this.defaultStyle;
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.globalStyle.load(au.churchId, id);
      return this.repos.globalStyle.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const result = await this.repos.globalStyle.loadForChurch(au.churchId);
      return result || this.defaultStyle;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, GlobalStyle[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const promises: Promise<GlobalStyle>[] = [];
      req.body.forEach((item) => { (item as any).churchId = au.churchId; promises.push(this.repos.globalStyle.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.globalStyle.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      await this.repos.globalStyle.delete(au.churchId, id);
      return {};
    });
  }
}
