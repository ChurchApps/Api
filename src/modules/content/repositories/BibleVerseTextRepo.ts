import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { BibleVerseText } from "../models/index.js";

@injectable()
export class BibleVerseTextRepo {
  public async save(model: BibleVerseText) {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("bibleVerseTexts").values({
      id: model.id,
      translationKey: model.translationKey,
      verseKey: model.verseKey,
      bookKey: model.bookKey,
      chapterNumber: model.chapterNumber,
      verseNumber: model.verseNumber,
      content: model.content,
      newParagraph: model.newParagraph
    } as any).onDuplicateKeyUpdate({
      content: sql`VALUES(content)`,
      newParagraph: sql`VALUES(newParagraph)`
    } as any).execute();
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
    if (startParts.length !== 3 || endParts.length !== 3) {
      const err: any = new Error("Invalid verse key format");
      err.status = 400;
      throw err;
    }
    const startChapter = parseInt(startParts[1], 0);
    const endChapter = parseInt(endParts[1], 0);
    const startVerse = parseInt(startParts[2], 0);
    const endVerse = parseInt(endParts[2], 0);

    const data = await this.loadChapters(translationKey, startParts[0], startChapter, endChapter);
    return this.filterResults(data, startChapter, startVerse, endChapter, endVerse);
  }

  // Cached rows can be a partial overlap from an earlier, smaller lookup; only a contiguous run from start to end is a hit.
  public static coversRange(rows: BibleVerseText[], startVerseKey: string, endVerseKey: string): boolean {
    if (!rows || rows.length === 0) return false;
    const [, startChapter, startVerse] = startVerseKey.split(".").map((p) => parseInt(p, 10));
    const [, endChapter, endVerse] = endVerseKey.split(".").map((p) => parseInt(p, 10));
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (first.chapterNumber !== startChapter || first.verseNumber !== startVerse) return false;
    if (last.chapterNumber !== endChapter || last.verseNumber !== endVerse) return false;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      const contiguous = cur.chapterNumber === prev.chapterNumber
        ? cur.verseNumber === prev.verseNumber + 1
        : cur.chapterNumber === prev.chapterNumber + 1 && cur.verseNumber === 1;
      if (!contiguous) return false;
    }
    return true;
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
