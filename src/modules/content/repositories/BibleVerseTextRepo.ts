import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { BibleVerseText } from "../models/index.js";

@injectable()
export class BibleVerseTextRepo {
  public async save(model: BibleVerseText) {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    await sql`INSERT INTO bibleVerseTexts (id, translationKey, verseKey, bookKey, chapterNumber, verseNumber, content, newParagraph)
      VALUES (${model.id}, ${model.translationKey}, ${model.verseKey}, ${model.bookKey}, ${model.chapterNumber}, ${model.verseNumber}, ${model.content}, ${model.newParagraph})
      ON DUPLICATE KEY UPDATE content=VALUES(content), newParagraph=VALUES(newParagraph)`.execute(getDb());
    return model;
  }

  public async saveAll(models: BibleVerseText[]) {
    const promises: Promise<BibleVerseText>[] = [];
    for (const model of models) {
      promises.push(this.save(model));
    }
    return Promise.all(promises);
  }

  public async delete(id: string) {
    await getDb().deleteFrom("bibleVerseTexts").where("id", "=", id).execute();
  }

  public async load(id: string): Promise<BibleVerseText | undefined> {
    return (await getDb().selectFrom("bibleVerseTexts").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  private async loadChapters(translationKey: string, bookKey: string, startChapter: number, endChapter: number) {
    return getDb().selectFrom("bibleVerseTexts").selectAll()
      .where("translationKey", "=", translationKey)
      .where("bookKey", "=", bookKey)
      .where("chapterNumber", ">=", startChapter)
      .where("chapterNumber", "<=", endChapter)
      .orderBy("chapterNumber")
      .orderBy("verseNumber")
      .execute() as any as BibleVerseText[];
  }

  private filterResults(data: BibleVerseText[], startChapter: number, startVerse: number, endChapter: number, endVerse: number) {
    const result: BibleVerseText[] = [];
    data.forEach((v: BibleVerseText) => {
      if (startChapter === endChapter) {
        if (v.chapterNumber === startChapter && v.verseNumber >= startVerse && v.verseNumber <= endVerse) result.push(v);
      } else {
        if (v.chapterNumber === startChapter && v.verseNumber >= startVerse) result.push(v);
        if (v.chapterNumber > startChapter && v.chapterNumber < endChapter) result.push(v);
        if (v.chapterNumber === endChapter && v.verseNumber <= endVerse) result.push(v);
      }
    });
    return result;
  }

  public async loadRange(translationKey: string, startVerseKey: string, endVerseKey: string) {
    const startParts = startVerseKey.split(".");
    const endParts = endVerseKey.split(".");
    if (startParts.length !== 3 || endParts.length !== 3) throw new Error("Invalid verse key format");
    const startChapter = parseInt(startParts[1], 0);
    const endChapter = parseInt(endParts[1], 0);
    const startVerse = parseInt(startParts[2], 0);
    const endVerse = parseInt(endParts[2], 0);

    const data = await this.loadChapters(translationKey, startParts[0], startChapter, endChapter);
    return this.filterResults(data, startChapter, startVerse, endChapter, endVerse);
  }

  public convertToModel(data: any) { return data as BibleVerseText; }
  public convertAllToModel(data: any[]) { return (data || []) as BibleVerseText[]; }

  protected rowToModel(row: any): BibleVerseText {
    return {
      id: row.id,
      translationKey: row.translationKey,
      verseKey: row.verseKey,
      bookKey: row.bookKey,
      chapterNumber: row.chapterNumber,
      verseNumber: row.verseNumber,
      content: row.content,
      newParagraph: row.newParagraph
    };
  }
}
