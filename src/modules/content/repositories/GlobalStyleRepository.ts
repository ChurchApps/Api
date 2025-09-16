import { TypedDB } from "../helpers";
import { GlobalStyle } from "../models";
import { UniqueIdHelper } from "@churchapps/apihelper";

import { CollectionHelper } from "../../../shared/helpers";

export class GlobalStyleRepository {
  public save(globalStyle: GlobalStyle) {
    if (UniqueIdHelper.isMissing(globalStyle.id)) return this.create(globalStyle);
    else return this.update(globalStyle);
  }

  public async create(globalStyle: GlobalStyle) {
    globalStyle.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO globalStyles (id, churchId, fonts, palette, customCss, customJS) VALUES (?, ?, ?, ?, ?, ?);";
    const params = [globalStyle.id, globalStyle.churchId, globalStyle.fonts, globalStyle.palette, globalStyle.customCss, globalStyle.customJS];
    await TypedDB.query(sql, params);
    return globalStyle;
  }

  public async update(globalStyle: GlobalStyle) {
    const sql = "UPDATE globalStyles SET fonts=?, palette=?, customCss=?, customJS=? WHERE id=? AND churchId=?";
    const params = [globalStyle.fonts, globalStyle.palette, globalStyle.customCss, globalStyle.customJS, globalStyle.id, globalStyle.churchId];
    await TypedDB.query(sql, params);
    return globalStyle;
  }

  public load(churchId: string, id: string): Promise<GlobalStyle> {
    return TypedDB.queryOne("SELECT * FROM globalStyles WHERE id=? AND churchId=?", [id, churchId]);
  }

  public loadForChurch(churchId: string): Promise<GlobalStyle[]> {
    return TypedDB.queryOne("SELECT * FROM globalStyles WHERE churchId=? limit 1;", [churchId]);
  }

  public delete(churchId: string, id: string): Promise<GlobalStyle> {
    return TypedDB.query("DELETE FROM globalStyles WHERE id=? AND churchId=?", [id, churchId]);
  }

  public loadAll(churchId: string): Promise<GlobalStyle[]> {
    return TypedDB.query("SELECT * FROM globalStyles WHERE churchId=?", [churchId]);
  }

  public convertToModel(churchId: string, data: any): GlobalStyle {
    const result: GlobalStyle = {
      id: data.id,
      churchId: data.churchId,
      fonts: data.fonts,
      palette: data.palette,
      customCss: data.customCss,
      customJS: data.customJS
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any): GlobalStyle[] {
    return CollectionHelper.convertAll<GlobalStyle>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
