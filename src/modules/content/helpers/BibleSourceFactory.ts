import { ApiBibleHelper } from "./ApiBibleHelper";
import { YouVersionHelper } from "./YouVersionHelper";
import { BibleBook, BibleChapter, BibleTranslation, BibleVerse, BibleVerseText } from "../models";

export class BibleSourceFactory {

  static async getTranslations(source: string): Promise<BibleTranslation[]> {
    if (source === "youversion") return YouVersionHelper.getAllTranslations();
    return ApiBibleHelper.getTranslations();
  }

  static async getAllTranslations(): Promise<BibleTranslation[]> {
    const [apiBible, youVersion] = await Promise.all([
      ApiBibleHelper.getTranslations().catch(() => []),
      YouVersionHelper.getAllTranslations().catch(() => [])
    ]);
    return [...apiBible, ...youVersion];
  }

  static async getBooks(source: string, translationKey: string): Promise<BibleBook[]> {
    if (source === "youversion") return YouVersionHelper.getBooks(translationKey);
    return ApiBibleHelper.getBooks(translationKey);
  }

  static async getChapters(source: string, translationKey: string, bookKey: string): Promise<BibleChapter[]> {
    if (source === "youversion") return YouVersionHelper.getChapters(translationKey, bookKey);
    return ApiBibleHelper.getChapters(translationKey, bookKey);
  }

  static async getVerses(source: string, translationKey: string, chapterKey: string): Promise<BibleVerse[]> {
    if (source === "youversion") return YouVersionHelper.getVerses(translationKey, chapterKey);
    return ApiBibleHelper.getVerses(translationKey, chapterKey);
  }

  static async getVerseText(source: string, translationKey: string, startVerseKey: string, endVerseKey: string): Promise<BibleVerseText[]> {
    if (source === "youversion") return YouVersionHelper.getVerseText(translationKey, startVerseKey, endVerseKey);
    return ApiBibleHelper.getVerseText(translationKey, startVerseKey, endVerseKey);
  }

  static async getCopyright(source: string, translationKey: string): Promise<string> {
    if (source === "youversion") return YouVersionHelper.getCopyright(translationKey);
    return ApiBibleHelper.getCopyright(translationKey);
  }

  static async search(source: string, translationKey: string, query: string): Promise<any> {
    if (source === "youversion") return YouVersionHelper.search(translationKey, query);
    return ApiBibleHelper.search(translationKey, query);
  }
}
