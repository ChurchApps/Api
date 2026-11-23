import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { BibleChapter } from "../models/index.js";

@injectable()
export class BibleChapterRepo {
  public async save(model: BibleChapter) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: BibleChapter): Promise<BibleChapter> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("bibleChapters").values({
      id: model.id,
      translationKey: model.translationKey,
      bookKey: model.bookKey,
      keyName: model.keyName,
      number: model.number
    }).execute();
    return model;
  }

  private async update(model: BibleChapter): Promise<BibleChapter> {
    await getDb().updateTable("bibleChapters").set({
      translationKey: model.translationKey,
      bookKey: model.bookKey,
      keyName: model.keyName,
      number: model.number
    }).where("id", "=", model.id).execute();
    return model;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("bibleChapters").where("id", "=", id).execute();
  }

  public async load(id: string): Promise<BibleChapter | undefined> {
    return (await getDb().selectFrom("bibleChapters").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadByBook(translationKey: string, bookKey: string): Promise<BibleChapter[]> {
    return getDb().selectFrom("bibleChapters").selectAll()
      .where("translationKey", "=", translationKey)
      .where("bookKey", "=", bookKey)
      .orderBy("number").execute();
  }

  public async saveAll(models: BibleChapter[]) {
    const promises = models.map(m => this.save(m));
    return Promise.all(promises);
  }

  public convertToModel(data: BibleChapter) { return data; }
  public convertAllToModel(data: BibleChapter[]) { return data || []; }

  protected rowToModel(row: BibleChapter): BibleChapter {
    return {
      id: row.id,
      translationKey: row.translationKey,
      bookKey: row.bookKey,
      keyName: row.keyName,
      number: row.number
    };
  }
}
