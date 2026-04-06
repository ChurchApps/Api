import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { PageHistory } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class PageHistoryRepo {
  public async save(model: PageHistory) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: PageHistory): Promise<PageHistory> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("pageHistory").values({
      id: model.id,
      churchId: model.churchId,
      pageId: model.pageId,
      blockId: model.blockId,
      snapshotJSON: model.snapshotJSON,
      description: model.description,
      userId: model.userId,
      createdDate: model.createdDate
    } as any).execute();
    return model;
  }

  private async update(model: PageHistory): Promise<PageHistory> {
    await getDb().updateTable("pageHistory").set({
      pageId: model.pageId,
      blockId: model.blockId,
      snapshotJSON: model.snapshotJSON,
      description: model.description,
      userId: model.userId,
      createdDate: model.createdDate
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("pageHistory").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<PageHistory | undefined> {
    return (await getDb().selectFrom("pageHistory").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<PageHistory[]> {
    return getDb().selectFrom("pageHistory").selectAll().where("churchId", "=", churchId).orderBy("createdDate", "desc").execute() as any;
  }

  public async loadForPage(churchId: string, pageId: string, limit: number = 50) {
    const safeLimit = parseInt(String(limit), 10);
    return getDb().selectFrom("pageHistory").selectAll()
      .where("churchId", "=", churchId)
      .where("pageId", "=", pageId)
      .orderBy("createdDate", "desc")
      .limit(safeLimit)
      .execute() as any;
  }

  public async loadForBlock(churchId: string, blockId: string, limit: number = 50) {
    const safeLimit = parseInt(String(limit), 10);
    return getDb().selectFrom("pageHistory").selectAll()
      .where("churchId", "=", churchId)
      .where("blockId", "=", blockId)
      .orderBy("createdDate", "desc")
      .limit(safeLimit)
      .execute() as any;
  }

  public async deleteOldHistory(churchId: string, pageId: string, daysToKeep: number = 30) {
    await getDb().deleteFrom("pageHistory")
      .where("churchId", "=", churchId)
      .where("pageId", "=", pageId)
      .where("createdDate", "<", sql`DATE_SUB(NOW(), INTERVAL ${daysToKeep} DAY)` as any)
      .execute();
  }

  public convertToModel(_churchId: string, data: any) { return data as PageHistory; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as PageHistory[]; }

  protected rowToModel(row: any): PageHistory {
    return {
      id: row.id,
      churchId: row.churchId,
      pageId: row.pageId,
      blockId: row.blockId,
      snapshotJSON: row.snapshotJSON,
      description: row.description,
      userId: row.userId,
      createdDate: row.createdDate
    };
  }
}
