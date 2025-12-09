import axios from "axios";
import { Environment } from "../../../shared/helpers/Environment";
import { BibleBook, BibleChapter, BibleTranslation, BibleVerse, BibleVerseText } from "../models";

export class YouVersionHelper {
  static baseUrl: string = "https://api.youversion.com/v1";

  static async getTranslations(languageTag: string = "en") {
    const result: BibleTranslation[] = [];
    // API requires language_ranges[] parameter
    const url = this.baseUrl + "/bibles?language_ranges[]=" + languageTag;
    const data = await this.getContent(url);

    if (data.data) {
      data.data.forEach((d: any) => {
        const translation: BibleTranslation = {
          attributionRequired: true,
          attributionString: d.copyright_short || d.copyright_long || "",
          name: d.title || d.abbreviation,
          nameLocal: d.localized_title || d.title || d.abbreviation,
          abbreviation: d.localized_abbreviation || d.abbreviation,
          description: d.info || "",
          language: d.language_tag || languageTag,
          source: "youversion",
          sourceKey: d.id.toString(),
          countryList: [],
          copyright: d.copyright_short || d.copyright_long || ""
        };

        result.push(translation);
      });
    }
    return result;
  }

  static async getAllTranslations() {
    // Use ISO 639-1 two-letter language codes
    const languages = ["en", "es", "pt", "fr", "de", "it", "zh", "ko", "ja", "ru"];
    const results: BibleTranslation[] = [];
    const seenKeys = new Set<string>();

    for (const lang of languages) {
      try {
        const translations = await this.getTranslations(lang);
        for (const t of translations) {
          if (!seenKeys.has(t.sourceKey)) {
            seenKeys.add(t.sourceKey);
            results.push(t);
          }
        }
      } catch (e) {
        console.log(`Failed to fetch YouVersion translations for ${lang}:`, e.message);
      }
    }
    return results;
  }

  static async getBooks(translationKey: string) {
    const result: BibleBook[] = [];
    const url = this.baseUrl + "/bibles/" + translationKey + "/books";
    const data = await this.getContent(url);

    // YouVersion returns: { data: [{ id: "GEN", title: "Genesis", full_title: "Genesis", abbreviation: "Gen", canon: "old_testament", chapters: [...] }, ...] }
    const books = data.data || data;
    if (Array.isArray(books)) {
      books.forEach((d: any, i: number) => {
        result.push({
          translationKey,
          keyName: d.id,  // USFM code like "GEN", "EXO", "REV"
          abbreviation: d.abbreviation || d.id,
          name: d.title || d.full_title || d.id,
          sort: i
        });
      });
    }
    return result;
  }

  static async getChapters(translationKey: string, bookKey: string) {
    const result: BibleChapter[] = [];
    const url = this.baseUrl + "/bibles/" + translationKey + "/books/" + bookKey + "/chapters";
    const data = await this.getContent(url);

    // YouVersion returns: { data: [{ id: 1, passage_id: "GEN.1", title: "1", verses: [...] }, ...] }
    if (data.data) {
      data.data.forEach((d: any) => {
        // Skip intro chapters (id like "INTRO1")
        const chapterNum = typeof d.id === "number" ? d.id : parseInt(d.id, 10);
        if (!isNaN(chapterNum)) {
          result.push({
            translationKey,
            bookKey,
            keyName: bookKey + "." + chapterNum,
            number: chapterNum
          });
        }
      });
    }
    return result;
  }

  static async getVerses(translationKey: string, chapterKey: string) {
    const result: BibleVerse[] = [];
    const parts = chapterKey.split(".");
    const bookKey = parts[0];
    const chapterNumber = parts[1];

    const url = this.baseUrl + "/bibles/" + translationKey + "/books/" + bookKey + "/chapters/" + chapterNumber + "/verses";
    const data = await this.getContent(url);

    // YouVersion returns: { data: [{ id: "1", passage_id: "GEN.1.1", title: "1" }, ...] }
    if (data.data) {
      data.data.forEach((d: any) => {
        const verseNum = typeof d.id === "number" ? d.id : parseInt(d.id, 10);
        if (!isNaN(verseNum)) {
          result.push({
            translationKey,
            chapterKey,
            keyName: bookKey + "." + chapterNumber + "." + verseNum,
            number: verseNum
          });
        }
      });
    }
    return result;
  }

  static async getVerseText(translationKey: string, startVerseKey: string, endVerseKey: string) {
    const result: BibleVerseText[] = [];

    const startParts = startVerseKey.split(".");
    const endParts = endVerseKey.split(".");
    const bookKey = startParts[0];
    const chapterNumber = parseInt(startParts[1], 10);
    const startVerse = parseInt(startParts[2], 10);
    const endVerse = parseInt(endParts[2], 10);

    // Fetch each verse individually using the passages endpoint
    // YouVersion passages endpoint: /passages/{passage_id} where passage_id is like GEN.1.1
    for (let v = startVerse; v <= endVerse; v++) {
      const verseKey = `${bookKey}.${chapterNumber}.${v}`;
      const url = this.baseUrl + "/bibles/" + translationKey + "/passages/" + verseKey + "?format=text";

      try {
        const data = await this.getContent(url);
        if (data.content) {
          result.push({
            translationKey,
            verseKey,
            bookKey,
            chapterNumber,
            verseNumber: v,
            content: data.content,
            newParagraph: false
          });
        }
      } catch (e: any) {
        console.log(`Failed to fetch verse ${verseKey}:`, e.message);
      }
    }

    return result;
  }

  static async getCopyright(translationKey: string) {
    const url = this.baseUrl + "/bibles/" + translationKey;
    const data = await this.getContent(url);
    return data.data?.copyright || "";
  }

  static async search(translationKey: string, query: string) {
    const url = this.baseUrl + "/bibles/" + translationKey + "/search?query=" + encodeURIComponent(query);
    const data = await this.getContent(url);
    return data;
  }

  static async getContent(url: string) {
    try {
      const resp = await axios.get(url, {
        headers: { "X-YVP-App-Key": Environment.youVersionApiKey }
      });
      return resp.data;
    } catch (error: any) {
      if (error.response) {
        console.log("YouVersion API error response:", JSON.stringify(error.response.data));
      }
      throw error;
    }
  }
}
