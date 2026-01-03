import { BibleBook, BibleChapter, BibleTranslation, BibleVerse, BibleVerseText } from "../models/index.js";

export interface IBibleSource {
  source: string;
  getTranslations(): Promise<BibleTranslation[]>;
  getBooks(translationKey: string): Promise<BibleBook[]>;
  getChapters(translationKey: string, bookKey: string): Promise<BibleChapter[]>;
  getVerses(translationKey: string, chapterKey: string): Promise<BibleVerse[]>;
  getVerseText(translationKey: string, startVerseKey: string, endVerseKey: string): Promise<BibleVerseText[]>;
  getCopyright(translationKey: string): Promise<string>;
  search(translationKey: string, query: string): Promise<any>;
}
