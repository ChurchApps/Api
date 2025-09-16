import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Page } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class PageRepo extends ConfiguredRepo<Page> {
  protected get repoConfig(): RepoConfig<Page> {
    return {
      tableName: "pages",
      hasSoftDelete: false,
      columns: ["url", "title", "layout"]
    };
  }

  public loadByUrl(churchId: string, url: string) {
    return TypedDB.queryOne("SELECT * FROM pages WHERE url=? AND churchId=?;", [url, churchId]);
  }

  protected rowToModel(row: any): Page {
    return {
      id: row.id,
      churchId: row.churchId,
      url: row.url,
      title: row.title,
      layout: row.layout
    };
  }
}
