import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { BibleVerse } from "../models/index.js";

@injectable()
export class BibleVerseRepo {
  public async save(model: BibleVerse) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: BibleVerse): Promise<BibleVerse> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("bibleVerses").values({
      id: model.id,
      translationKey: model.translationKey,
      chapterKey: model.chapterKey,
      keyName: model.keyName,
      number: model.number
    } as any).execute();
    return model;
  }

  private async update(model: BibleVerse): Promise<BibleVerse> {
    await getDb().updateTable("bibleVerses").set({
      translationKey: model.translationKey,
      chapterKey: model.chapterKey,
      keyName: model.keyName,
      number: model.number
    }).where("id", "=", model.id).execute();
    return model;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("bibleVerses").where("id", "=", id).execute();
  }

  public async load(id: string): Promise<BibleVerse | undefined> {
    return (await getDb().selectFrom("bibleVerses").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadByChapter(translationKey: string, chapterKey: string) {
    return getDb().selectFrom("bibleVerses").selectAll()
      .where("translationKey", "=", translationKey)
      .where("chapterKey", "=", chapterKey)
      .orderBy("number").execute() as any;
  }

  public async saveAll(models: BibleVerse[]) {
    const promises = models.map(m => this.save(m));
    return Promise.all(promises);
  }

  public convertToModel(data: any) { return data as BibleVerse; }
  public convertAllToModel(data: any[]) { return (data || []) as BibleVerse[]; }

  protected rowToModel(row: any): BibleVerse {
    return {
      id: row.id,
      translationKey: row.translationKey,
      chapterKey: row.chapterKey,
      keyName: row.keyName,
      number: row.number
    };
  }
}
