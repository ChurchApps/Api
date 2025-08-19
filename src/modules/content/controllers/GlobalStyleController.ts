import { controller, httpPost, httpGet, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { Permissions } from "../helpers";
import { ContentBaseController } from "./ContentBaseController";
import { GlobalStyle } from "../models";

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
  public async loadAnon(
    @requestParam("churchId") churchId: string,
    req: express.Request,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const result = await this.repositories.globalStyle.loadForChurch(churchId);
      return result || this.defaultStyle;
    });
  }

  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const result = await this.repositories.globalStyle.loadForChurch(au.churchId);
      return result || this.defaultStyle;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, GlobalStyle[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const promises: Promise<GlobalStyle>[] = [];
        req.body.forEach((globalStyle) => {
          globalStyle.churchId = au.churchId;
          promises.push(this.repositories.globalStyle.save(globalStyle));
        });
        const result = await Promise.all(promises);
        return result;
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await this.repositories.globalStyle.delete(id, au.churchId);
        return this.json({});
      }
    });
  }
}
