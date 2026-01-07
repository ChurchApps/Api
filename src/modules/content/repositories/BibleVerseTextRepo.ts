import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { BibleVerseText } from "../models/index.js";
import { GlobalConfiguredRepo, GlobalRepoConfig } from "../../../shared/infrastructure/GlobalConfiguredRepo.js";

@injectable()
export class BibleVerseTextRepo extends GlobalConfiguredRepo<BibleVerseText> {
  protected get repoConfig(): GlobalRepoConfig<BibleVerseText> {
    return {
      tableName: "bibleVerseTexts",
      hasSoftDelete: false,
      columns: ["translationKey", "verseKey", "bookKey", "chapterNumber", "verseNumber", "content", "newParagraph"],
      defaultOrderBy: "chapterNumber, verseNumber"
    };
  }

  private loadChapters(translationKey: string, bookKey: string, startChapter: number, endChapter: number) {
    return TypedDB.query("SELECT * FROM bibleVerseTexts WHERE translationKey=? and bookKey=? AND chapterNumber BETWEEN ? AND ? order by chapterNumber, verseNumber;", [
      translationKey,
      bookKey,
      startChapter,
      endChapter
    ]);
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

  public async saveAll(models: BibleVerseText[]) {
    const promises: Promise<BibleVerseText>[] = [];
    for (const model of models) {
      promises.push(this.save(model));
    }
    return Promise.all(promises);
  }

  public async save(model: BibleVerseText) {
    if (!model.id) model.id = this.createId();
    const sql = `INSERT INTO bibleVerseTexts (id, translationKey, verseKey, bookKey, chapterNumber, verseNumber, content, newParagraph)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE content=VALUES(content), newParagraph=VALUES(newParagraph);`;
    await TypedDB.query(sql, [
      model.id,
      model.translationKey,
      model.verseKey,
      model.bookKey,
      model.chapterNumber,
      model.verseNumber,
      model.content,
      model.newParagraph
    ]);
    return model;
  }
}
