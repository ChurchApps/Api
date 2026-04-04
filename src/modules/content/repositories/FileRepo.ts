import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { File } from "../models/index.js";

export class FileRepo {
  public async save(model: File) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: File): Promise<File> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("files").values({
      id: model.id,
      churchId: model.churchId,
      contentType: model.contentType,
      contentId: model.contentId,
      fileName: model.fileName,
      contentPath: model.contentPath,
      fileType: model.fileType,
      size: model.size,
      dateModified: sql`NOW()` as any
    } as any).execute();
    return model;
  }

  private async update(model: File): Promise<File> {
    await getDb().updateTable("files").set({
      contentType: model.contentType,
      contentId: model.contentId,
      fileName: model.fileName,
      contentPath: model.contentPath,
      fileType: model.fileType,
      size: model.size,
      dateModified: model.dateModified
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("files").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<File | undefined> {
    return (await getDb().selectFrom("files").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<File[]> {
    return getDb().selectFrom("files").selectAll().where("churchId", "=", churchId).execute() as any;
  }

  public async loadByIds(churchId: string, ids: string[]): Promise<File[]> {
    if (!ids || ids.length === 0) return [];
    return getDb().selectFrom("files").selectAll()
      .where("churchId", "=", churchId)
      .where("id", "in", ids).execute() as any;
  }

  public async loadForContent(churchId: string, contentType: string, contentId: string): Promise<File[]> {
    return getDb().selectFrom("files").selectAll()
      .where("churchId", "=", churchId)
      .where("contentType", "=", contentType)
      .where("contentId", "=", contentId).execute() as any;
  }

  public async loadForWebsite(churchId: string): Promise<File[]> {
    return getDb().selectFrom("files").selectAll()
      .where("churchId", "=", churchId)
      .where("contentType", "=", "website").execute() as any;
  }

  public async loadTotalBytes(churchId: string, contentType: string, contentId: string): Promise<{ size: number }> {
    const result = await sql`select IFNULL(sum(size), 0) as size from files where churchId=${churchId} and contentType=${contentType} and contentId=${contentId}`.execute(getDb());
    return result.rows[0] as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as File; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as File[]; }
}
