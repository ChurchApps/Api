import { injectable } from "inversify";
import { eq, and, asc, between, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { bibleVerseTexts } from "../../../db/schema/content.js";
import { BibleVerseText } from "../models/index.js";

@injectable()
export class BibleVerseTextRepo extends GlobalDrizzleRepo<typeof bibleVerseTexts> {
  protected readonly table = bibleVerseTexts;
  protected readonly moduleName = "content";

  public async save(model: any) {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    await this.db.execute(sql`
      INSERT INTO bibleVerseTexts (id, translationKey, verseKey, bookKey, chapterNumber, verseNumber, content, newParagraph)
      VALUES (${model.id}, ${model.translationKey}, ${model.verseKey}, ${model.bookKey}, ${model.chapterNumber}, ${model.verseNumber}, ${model.content}, ${model.newParagraph})
      ON DUPLICATE KEY UPDATE content = VALUES(content), newParagraph = VALUES(newParagraph)
    `);
    return model;
  }

  public async saveAll(models: any[]) {
    return Promise.all(models.map((m) => this.save(m)));
  }

  private loadChapters(translationKey: string, bookKey: string, startChapter: number, endChapter: number) {
    return this.db.select().from(bibleVerseTexts).where(and(
      eq(bibleVerseTexts.translationKey, translationKey),
      eq(bibleVerseTexts.bookKey, bookKey),
      between(bibleVerseTexts.chapterNumber, startChapter, endChapter)
    )).orderBy(asc(bibleVerseTexts.chapterNumber), asc(bibleVerseTexts.verseNumber));
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

    const data: any = await this.loadChapters(translationKey, startParts[0], startChapter, endChapter);
    return this.filterResults(data, startChapter, startVerse, endChapter, endVerse);
  }
}
