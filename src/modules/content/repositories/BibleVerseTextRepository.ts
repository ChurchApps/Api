import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { BibleVerseText } from "../models";

@injectable()
export class BibleVerseTextRepository {
  public saveAll(texts: BibleVerseText[]) {
    const promises: Promise<BibleVerseText>[] = [];
    texts.forEach((v) => {
      promises.push(this.save(v));
    });
    return Promise.all(promises);
  }

  public save(text: BibleVerseText) {
    return text.id ? this.update(text) : this.create(text);
  }

  private async create(text: BibleVerseText) {
    text.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO bibleVerseTexts (id, translationKey, verseKey, bookKey, chapterNumber, verseNumber, content, newParagraph) VALUES (?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [text.id, text.translationKey, text.verseKey, text.bookKey, text.chapterNumber, text.verseNumber, text.content, text.newParagraph];
    await TypedDB.query(sql, params);
    return text;
  }

  private async update(text: BibleVerseText) {
    const sql = "UPDATE bibleVerseTexts SET translationKey=?, verseKey=?, bookKey=?, chapterNumber=?, verseNumber=?, content=?, newParagraph=? WHERE id=?";
    const params = [text.translationKey, text.verseKey, text.bookKey, text.chapterNumber, text.verseNumber, text.content, text.newParagraph, text.id];
    await TypedDB.query(sql, params);
    return text;
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM bibleVerseTexts WHERE id=?;", [id]);
  }

  public load(id: string) {
    return TypedDB.queryOne("SELECT * FROM bibleVerseTexts WHERE id=?;", [id]);
  }

  private loadChapters(translationKey: string, bookKey: string, startChapter: number, endChapter: number) {
    return TypedDB.query("SELECT * FROM bibleVerseTexts WHERE translationKey=? and bookKey=? AND chapterNumber BETWEEN ? AND ? order by chapterNumber, verseNumber;", [translationKey, bookKey, startChapter, endChapter]);
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
}
