import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Page } from "../models/index.js";

@injectable()
export class PageRepo {
  public async save(model: Page) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Page): Promise<Page> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("pages").values({
      id: model.id,
      churchId: model.churchId,
      url: model.url,
      title: model.title,
      layout: model.layout
    } as any).execute();
    return model;
  }

  private async update(model: Page): Promise<Page> {
    await getDb().updateTable("pages").set({
      url: model.url,
      title: model.title,
      layout: model.layout
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("pages").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Page | undefined> {
    return (await getDb().selectFrom("pages").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Page[]> {
    return getDb().selectFrom("pages").selectAll().where("churchId", "=", churchId).execute() as any;
  }

  public async loadByUrl(churchId: string, url: string) {
    return (await getDb().selectFrom("pages").selectAll().where("url", "=", url).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public convertToModel(_churchId: string, data: any) { return data as Page; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Page[]; }

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
