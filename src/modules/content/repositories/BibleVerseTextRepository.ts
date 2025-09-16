import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { BibleVerseText } from "../models";
import { GlobalConfiguredRepository, GlobalRepoConfig } from "../../../shared/infrastructure/GlobalConfiguredRepository";

@injectable()
export class BibleVerseTextRepository extends GlobalConfiguredRepository<BibleVerseText> {
  protected get repoConfig(): GlobalRepoConfig<BibleVerseText> {
    return {
      tableName: "bibleVerseTexts",
      hasSoftDelete: false,
      insertColumns: ["translationKey", "verseKey", "bookKey", "chapterNumber", "verseNumber", "content", "newParagraph"],
      updateColumns: ["translationKey", "verseKey", "bookKey", "chapterNumber", "verseNumber", "content", "newParagraph"],
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
}
