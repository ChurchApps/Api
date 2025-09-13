import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { Permissions } from "../helpers";
import { ContentCrudController } from "./ContentCrudController";
import { GlobalStyle } from "../models";

@controller("/content/globalStyles")
export class GlobalStyleController extends ContentCrudController {
  protected crudSettings = {
    repoKey: "globalStyle",
    permissions: { view: null, edit: Permissions.content.edit },
    routes: ["post", "delete"] as const
  };
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
}
