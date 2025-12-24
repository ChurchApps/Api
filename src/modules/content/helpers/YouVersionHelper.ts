import axios from "axios";
import { Environment } from "../../../shared/helpers/Environment";
import { BibleBook, BibleChapter, BibleTranslation, BibleVerse, BibleVerseText } from "../models";

export class YouVersionHelper {
  static baseUrl: string = "https://api.youversion.com/v1";

  //Import these
  static includedAbbreviations: string[] = ["BDO1573", "BDS", "CARS", "CARSA", "CARST", "CPDV", "CSLAV", "DELUT", "ELB", "ELB71", "FMAR", "GANTP", "GNV", "Hfa", "JA1955", "JCB", "KLB", "LSG", "NBV-P", "NIrV", "NIV", "NIVUK", "NVIs", "OL", "OST", "RVES", "TKW", "WEBUS", "НРП", "PdDpt", "AKNA", "AL", "APB", "ASNA", "BDSC", "BEN", "BIU", "BPH", "CCB", "CCL", "EEEE", "EIV", "FAYH", "GAW", "GKY", "APD", "BMYO"];
  // Don't import these (Duplicates)
  static excludedAbbreviations: string[] = ["ASV", "BSB", "DB1885", "FBV", "LSV", "NVI", "TCENT", "TOJB2011", "WEBBE", "WMB", "WMBBE", "ELBBK", "NTBnBL2025", "JND", "WBTP", "BLT", "VBL", "Abt", "ASD", "ABT", "BCV"];

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
          sourceKey: "YOUVERSION-" + d.id.toString(),
          countryList: [],
          copyright: d.copyright_short || d.copyright_long || ""
        };

        result.push(translation);
      });
    }
    return result;
  }

  // Fetches all translations from YouVersion API (raw, unfiltered)
  static async fetchAllTranslations() {
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

  // Returns only translations that are in the included list
  static async getAllTranslations() {
    if (this.includedAbbreviations.length === 0) {
      return [];
    }
    const allTranslations = await this.fetchAllTranslations();
    return allTranslations.filter(t => this.includedAbbreviations.includes(t.abbreviation));
  }

  // Returns translations that are not in either the included or excluded lists
  static async getAvailableTranslations() {
    const allTranslations = await this.fetchAllTranslations();
    return allTranslations.filter(t =>
      !this.includedAbbreviations.includes(t.abbreviation) &&
      !this.excludedAbbreviations.includes(t.abbreviation)
    );
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

    // Fetch entire chapter at once using HTML format
    const chapterKey = `${bookKey}.${chapterNumber}`;
    const url = this.baseUrl + "/bibles/" + translationKey + "/passages/" + chapterKey + "?format=html";

    try {
      const data = await this.getContent(url);
      if (data.content) {
        const verses = this.parseChapterHtml(data.content, bookKey, chapterNumber, translationKey);
        // Filter to only return requested verse range
        for (const verse of verses) {
          if (verse.verseNumber >= startVerse && verse.verseNumber <= endVerse) {
            result.push(verse);
          }
        }
      }
    } catch (e: any) {
      console.log(`Failed to fetch chapter ${chapterKey}:`, e.message);
    }

    return result;
  }

  // Parse YouVersion HTML and return array of verses with their numbers and text
  // HTML format: <span class="yv-v" v="1"></span><span class="yv-vlbl">1</span>Text...<span class="yv-v" v="2"></span>...
  static parseVersesFromHtml(html: string): { verseNumber: number; text: string }[] {
    const result: { verseNumber: number; text: string }[] = [];

    // Split by verse markers, keeping the marker in the result
    // Each verse starts with <span class="yv-v" v="N"></span>
    const parts = html.split(/(?=<span class="yv-v" v="\d+"><\/span>)/);

    for (const part of parts) {
      // Extract verse number from the marker
      const verseMatch = part.match(/<span class="yv-v" v="(\d+)"><\/span>/);
      if (!verseMatch) continue;

      const verseNumber = parseInt(verseMatch[1], 10);

      // Get content after the verse marker
      let content = part.substring(verseMatch[0].length);

      // Remove verse label spans like <span class="yv-vlbl">1</span>
      content = content.replace(/<span class="yv-vlbl">\d+<\/span>/g, "");

      // Remove all HTML tags
      content = content.replace(/<[^>]*>/g, "");

      // Decode HTML entities
      content = content
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ");

      // Normalize whitespace
      content = content.replace(/\s+/g, " ").trim();

      if (content) {
        result.push({ verseNumber, text: content });
      }
    }

    return result;
  }

  // Build BibleVerseText objects from parsed verses
  static parseChapterHtml(html: string, bookKey: string, chapterNumber: number, translationKey: string): BibleVerseText[] {
    const verses = this.parseVersesFromHtml(html);

    return verses.map(v => ({
      translationKey,
      verseKey: `${bookKey}.${chapterNumber}.${v.verseNumber}`,
      bookKey,
      chapterNumber,
      verseNumber: v.verseNumber,
      content: v.text,
      newParagraph: false
    }));
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
