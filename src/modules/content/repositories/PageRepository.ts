import { UniqueIdHelper } from "@churchapps/apihelper";
import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Page } from "../models";

@injectable()
export class PageRepository {
  public save(page: Page) {
    return page.id ? this.update(page) : this.create(page);
  }

  public async create(page: Page) {
    if (!page.id) page.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO pages (id, churchId, url, title, layout) VALUES (?, ?, ?, ?, ?);";
    const params = [page.id, page.churchId, page.url, page.title, page.layout];
    await TypedDB.query(sql, params);
    return page;
  }

  private async update(page: Page) {
    const sql = "UPDATE pages SET url=?, title=?, layout=? WHERE id=? and churchId=?";
    const params = [page.url, page.title, page.layout, page.id, page.churchId];
    await TypedDB.query(sql, params);
    return page;
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM pages WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM pages WHERE id=? AND churchId=? order by url;", [id, churchId]);
  }

  public loadByUrl(churchId: string, url: string) {
    return TypedDB.queryOne("SELECT * FROM pages WHERE url=? AND churchId=?;", [url, churchId]);
  }

  public loadAll(churchId: string) {
    return TypedDB.query("SELECT * FROM pages WHERE churchId=?;", [churchId]);
  }
}
