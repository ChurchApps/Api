import { ApiBibleHelper } from "./ApiBibleHelper.js";
import { YouVersionHelper } from "./YouVersionHelper.js";
import { BibleBook, BibleChapter, BibleTranslation, BibleVerse, BibleVerseText } from "../models/index.js";

export class BibleSourceFactory {

  // Strip YOUVERSION- prefix from sourceKey to get the raw YouVersion API key
  private static stripYouVersionPrefix(translationKey: string): string {
    return translationKey.replace(/^YOUVERSION-/, "");
  }

  static async getTranslations(source: string): Promise<BibleTranslation[]> {
    if (source === "youversion") return YouVersionHelper.getAllTranslations();
    return ApiBibleHelper.getTranslations();
  }

  static async getAllTranslations(): Promise<BibleTranslation[]> {
    const [apiBible, youVersion] = await Promise.all([
      ApiBibleHelper.getTranslations().catch(() => []),
      // YouVersionHelper.getAllTranslations().catch(() => [])  // Temporarily disabled
      Promise.resolve([])
    ]);
    return [...apiBible, ...youVersion];
  }

  static async getBooks(source: string, translationKey: string): Promise<BibleBook[]> {
    if (source === "youversion") return YouVersionHelper.getBooks(this.stripYouVersionPrefix(translationKey));
    return ApiBibleHelper.getBooks(translationKey);
  }

  static async getChapters(source: string, translationKey: string, bookKey: string): Promise<BibleChapter[]> {
    if (source === "youversion") return YouVersionHelper.getChapters(this.stripYouVersionPrefix(translationKey), bookKey);
    return ApiBibleHelper.getChapters(translationKey, bookKey);
  }

  static async getVerses(source: string, translationKey: string, chapterKey: string): Promise<BibleVerse[]> {
    if (source === "youversion") return YouVersionHelper.getVerses(this.stripYouVersionPrefix(translationKey), chapterKey);
    return ApiBibleHelper.getVerses(translationKey, chapterKey);
  }

  static async getVerseText(source: string, translationKey: string, startVerseKey: string, endVerseKey: string): Promise<BibleVerseText[]> {
    console.log("DEBUG BibleSourceFactory.getVerseText - source:", source, "translationKey:", translationKey, "stripped:", this.stripYouVersionPrefix(translationKey));
    if (source === "youversion") return YouVersionHelper.getVerseText(this.stripYouVersionPrefix(translationKey), startVerseKey, endVerseKey);
    return ApiBibleHelper.getVerseText(translationKey, startVerseKey, endVerseKey);
  }

  static async getCopyright(source: string, translationKey: string): Promise<string> {
    if (source === "youversion") return YouVersionHelper.getCopyright(this.stripYouVersionPrefix(translationKey));
    return ApiBibleHelper.getCopyright(translationKey);
  }

  static async search(source: string, translationKey: string, query: string): Promise<any> {
    if (source === "youversion") return YouVersionHelper.search(this.stripYouVersionPrefix(translationKey), query);
    return ApiBibleHelper.search(translationKey, query);
  }

  static async getAvailableTranslations(source: string): Promise<BibleTranslation[]> {
    if (source === "youversion") return YouVersionHelper.getAvailableTranslations();
    return [];
  }
}
