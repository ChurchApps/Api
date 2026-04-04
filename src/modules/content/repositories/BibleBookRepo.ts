import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { BibleBook } from "../models/index.js";

@injectable()
export class BibleBookRepo {
  public async save(model: BibleBook) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: BibleBook): Promise<BibleBook> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("bibleBooks").values({
      id: model.id,
      translationKey: model.translationKey,
      keyName: model.keyName,
      abbreviation: model.abbreviation,
      name: model.name,
      sort: model.sort
    } as any).execute();
    return model;
  }

  private async update(model: BibleBook): Promise<BibleBook> {
    await getDb().updateTable("bibleBooks").set({
      translationKey: model.translationKey,
      keyName: model.keyName,
      abbreviation: model.abbreviation,
      name: model.name,
      sort: model.sort
    }).where("id", "=", model.id).execute();
    return model;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("bibleBooks").where("id", "=", id).execute();
  }

  public async load(id: string): Promise<BibleBook | undefined> {
    return (await getDb().selectFrom("bibleBooks").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadAll(translationKey: string) {
    return getDb().selectFrom("bibleBooks").selectAll().where("translationKey", "=", translationKey).orderBy("sort").execute() as any;
  }

  public async saveAll(models: BibleBook[]) {
    const promises = models.map(m => this.save(m));
    return Promise.all(promises);
  }

  public convertToModel(data: any) { return data as BibleBook; }
  public convertAllToModel(data: any[]) { return (data || []) as BibleBook[]; }

  protected rowToModel(row: any): BibleBook {
    return {
      id: row.id,
      translationKey: row.translationKey,
      keyName: row.keyName,
      abbreviation: row.abbreviation,
      name: row.name,
      sort: row.sort
    };
  }
}
