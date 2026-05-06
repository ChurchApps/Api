import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { GlobalStyle } from "../models/index.js";

@injectable()
export class GlobalStyleRepo {
  public async save(model: GlobalStyle) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: GlobalStyle): Promise<GlobalStyle> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("globalStyles").values({
      id: model.id,
      churchId: model.churchId,
      fonts: model.fonts,
      palette: model.palette,
      typography: model.typography,
      spacing: model.spacing,
      borderRadius: model.borderRadius,
      navStyles: model.navStyles,
      customCss: model.customCss,
      customJS: model.customJS
    } as any).execute();
    return model;
  }

  private async update(model: GlobalStyle): Promise<GlobalStyle> {
    await getDb().updateTable("globalStyles").set({
      fonts: model.fonts,
      palette: model.palette,
      typography: model.typography,
      spacing: model.spacing,
      borderRadius: model.borderRadius,
      navStyles: model.navStyles,
      customCss: model.customCss,
      customJS: model.customJS
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("globalStyles").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<GlobalStyle | undefined> {
    return (await getDb().selectFrom("globalStyles").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<GlobalStyle[]> {
    return getDb().selectFrom("globalStyles").selectAll().where("churchId", "=", churchId).execute() as any;
  }

  public async loadForChurch(churchId: string): Promise<GlobalStyle | undefined> {
    return (await getDb().selectFrom("globalStyles").selectAll().where("churchId", "=", churchId).limit(1).executeTakeFirst()) ?? null;
  }

  public convertToModel(_churchId: string, data: any) { return data as GlobalStyle; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as GlobalStyle[]; }

  protected rowToModel(row: any): GlobalStyle {
    return {
      id: row.id,
      churchId: row.churchId,
      fonts: row.fonts,
      palette: row.palette,
      typography: row.typography,
      spacing: row.spacing,
      borderRadius: row.borderRadius,
      navStyles: row.navStyles,
      customCss: row.customCss,
      customJS: row.customJS
    };
  }
}
