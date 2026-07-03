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
      siteId: model.siteId ?? "",
      url: model.url,
      title: model.title,
      layout: model.layout,
      visibility: model.visibility,
      groupIds: model.groupIds,
      metaDescription: model.metaDescription
    } as any).execute();
    return model;
  }

  private async update(model: Page): Promise<Page> {
    await getDb().updateTable("pages").set({
      siteId: model.siteId ?? "",
      url: model.url,
      title: model.title,
      layout: model.layout,
      visibility: model.visibility,
      groupIds: model.groupIds,
      metaDescription: model.metaDescription
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("pages").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  // publishedJSON (a full page snapshot) is intentionally excluded from loads; use loadPublished.
  private static readonly summaryColumns = [
    "id", "churchId", "siteId", "url", "title", "layout", "publishedAt", "visibility", "groupIds", "metaDescription"
  ] as const;

  public async load(churchId: string, id: string): Promise<Page | undefined> {
    return (await getDb().selectFrom("pages").select(PageRepo.summaryColumns).where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string, siteId = ""): Promise<Page[]> {
    return getDb().selectFrom("pages").select(PageRepo.summaryColumns).where("churchId", "=", churchId).where("siteId", "=", siteId).execute() as any;
  }

  public async loadByUrl(churchId: string, url: string, siteId = "") {
    return (await getDb().selectFrom("pages").select(PageRepo.summaryColumns).where("url", "=", url).where("churchId", "=", churchId).where("siteId", "=", siteId).executeTakeFirst()) ?? null;
  }

  public async loadPublished(churchId: string, id: string): Promise<Page | undefined> {
    return (await getDb().selectFrom("pages").select(["id", "publishedJSON", "publishedAt"]).where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) as any ?? null;
  }

  public async savePublished(churchId: string, id: string, publishedJSON: string | null): Promise<Date | null> {
    const publishedAt = publishedJSON ? new Date() : null;
    await getDb().updateTable("pages").set({ publishedJSON, publishedAt }).where("id", "=", id).where("churchId", "=", churchId).execute();
    return publishedAt;
  }

  public convertToModel(_churchId: string, data: any) { return data as Page; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Page[]; }

  protected rowToModel(row: any): Page {
    return {
      id: row.id,
      churchId: row.churchId,
      siteId: row.siteId,
      url: row.url,
      title: row.title,
      layout: row.layout,
      publishedAt: row.publishedAt,
      visibility: row.visibility,
      groupIds: row.groupIds,
      metaDescription: row.metaDescription
    };
  }
}
