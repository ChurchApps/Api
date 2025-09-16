import { injectable } from "inversify";
import { TypedDB } from "../helpers";
import { GlobalStyle } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class GlobalStyleRepository extends ConfiguredRepository<GlobalStyle> {
  protected get repoConfig(): RepoConfig<GlobalStyle> {
    return {
      tableName: "globalStyles",
      hasSoftDelete: false,
      insertColumns: ["fonts", "palette", "customCss", "customJS"],
      updateColumns: ["fonts", "palette", "customCss", "customJS"]
    };
  }

  // Override to use TypedDB instead of DB
  protected async create(model: GlobalStyle): Promise<GlobalStyle> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    const { sql, params } = this.buildInsert(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: GlobalStyle): Promise<GlobalStyle> {
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
  }

  public async load(churchId: string, id: string): Promise<GlobalStyle> {
    return TypedDB.queryOne("SELECT * FROM globalStyles WHERE id=? AND churchId=?", [id, churchId]);
  }

  public async loadAll(churchId: string): Promise<GlobalStyle[]> {
    return TypedDB.query("SELECT * FROM globalStyles WHERE churchId=?", [churchId]);
  }

  public async delete(churchId: string, id: string): Promise<any> {
    return TypedDB.query("DELETE FROM globalStyles WHERE id=? AND churchId=?", [id, churchId]);
  }

  public loadForChurch(churchId: string): Promise<GlobalStyle[]> {
    return TypedDB.queryOne("SELECT * FROM globalStyles WHERE churchId=? limit 1;", [churchId]);
  }

  protected rowToModel(row: any): GlobalStyle {
    return {
      id: row.id,
      churchId: row.churchId,
      fonts: row.fonts,
      palette: row.palette,
      customCss: row.customCss,
      customJS: row.customJS
    };
  }
}
