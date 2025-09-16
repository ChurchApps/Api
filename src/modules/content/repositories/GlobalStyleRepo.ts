import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { GlobalStyle } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class GlobalStyleRepo extends ConfiguredRepo<GlobalStyle> {
  protected get repoConfig(): RepoConfig<GlobalStyle> {
    return {
      tableName: "globalStyles",
      hasSoftDelete: false,
      columns: ["fonts", "palette", "customCss", "customJS"]
    };
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
