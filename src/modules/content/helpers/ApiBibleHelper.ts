import axios from "axios";
import { Environment } from "../../../shared/helpers/Environment";
import { BibleBook, BibleChapter, BibleTranslation, BibleVerse, BibleVerseText } from "../models";
import { ArrayHelper } from "@churchapps/apihelper";

export class ApiBibleHelper {
  static baseUrl: string = "https://api.scripture.api.bible/v1";

  static attributionRequired: string[] = [
    "a81b73293d3080c9-01", // AMP
    "e3f420b9665abaeb-01", // LBLA
    "a761ca71e0b3ddcf-01", // NASB2020
    "b8ee27bcd1cae43a-01", // NASB95
    "ce11b813f9a27e20-01" // NBLA
  ];

  static async getCopyright(translationKey: string) {
    const books = await ApiBibleHelper.getBooks(translationKey);
    const verseKey = books[0].keyName + ".1.1";
    const url =
      this.baseUrl +
      "/bibles/" +
      translationKey +
      "/verses/" +
      verseKey +
      "-" +
      verseKey +
      "?content-type=json&include-titles=false&include-verse-numbers=false";
    const data = await this.getContent(url);
    return data.data.copyright;
  }

  static async getTranslations() {
    const result: BibleTranslation[] = [];
    const url = this.baseUrl + "/bibles";
    const data = await this.getContent(url);

    data.data.forEach((d: any) => {
      const translation: BibleTranslation = {
        attributionRequired: this.attributionRequired.indexOf(d.id) >= 0,
        attributionString: "",
        name: d.name,
        nameLocal: d.nameLocal,
        abbreviation: d.abbreviation,
        description: d.description,
        language: d.language.id,
        source: "api.bible",
        sourceKey: d.id,
        countryList: []
      };
      // copyright: this.translationCopyrights[d.id]

      d.countries.forEach((c: any) => {
        translation.countryList.push(c.id.toLowerCase());
      });
      translation.countries = translation.countryList.join(",");

      result.push(translation);
    });
    return result;
  }

  static async search(translationKey: string, query: string) {
    const url = this.baseUrl + "/bibles/" + translationKey + "/search?query=" + encodeURIComponent(query);
    const data = await this.getContent(url);

    return data;
  }

  static async getBooks(translationKey: string) {
    const result: BibleBook[] = [];
    const url = this.baseUrl + "/bibles/" + translationKey + "/books";
    const data = await this.getContent(url);

    data.data.forEach((d: any, i: number) => {
      result.push({
        translationKey,
        keyName: d.id,
        abbreviation: d.abbreviation,
        name: d.name,
        sort: i
      });
    });
    return result;
  }

  static async getChapters(translationKey: string, bookKey: string) {
    const result: BibleChapter[] = [];
    const url = this.baseUrl + "/bibles/" + translationKey + "/books/" + bookKey + "/chapters";
    const data = await this.getContent(url);

    data.data.forEach((d: any) => {
      result.push({
        translationKey,
        bookKey,
        keyName: d.id,
        number: parseInt(d.number, 0) || 0
      });
    });
    return result;
  }

  static async getVerses(translationKey: string, chapterKey: string) {
    const result: BibleVerse[] = [];
    const url = this.baseUrl + "/bibles/" + translationKey + "/chapters/" + chapterKey + "/verses";
    const data = await this.getContent(url);

    data.data.forEach((d: any) => {
      const parts = d.id.split(".");
      result.push({
        translationKey,
        chapterKey,
        keyName: d.id,
        number: parseInt(parts[parts.length - 1], 0) || 0
      });
    });
    return result;
  }

  static async getVerseText(translationKey: string, startVerseKey: string, endVerseKey: string) {
    const url =
      this.baseUrl +
      "/bibles/" +
      translationKey +
      "/verses/" +
      startVerseKey +
      "-" +
      endVerseKey +
      "?content-type=json&include-titles=false&include-verse-numbers=false";
    const data = await this.getContent(url);
    const result: BibleVerseText[] = [];
    data.data.content.forEach((c: any) => {
      c.items.forEach((i: any, idx: number) => {
        this.parseVerseItem(i, c, idx, result, translationKey);
      });
    });
    return result;
  }

  static parseVerseItem(item: any, parent: any, index: number, result: BibleVerseText[], translationKey: string) {
    if (item.attrs?.verseId) {
      const parts = item.attrs.verseId.split(".");
      const verse = parseInt(parts[parts.length - 1], 0) || 0;

      if (verse > 0 && item.text.trim().length > 0) {
        const existing = ArrayHelper.getOne(result, "verseKey", item.attrs.verseId);
        if (existing) {
          const firstChar = item.text.trim().charAt(0);
          const regex = /^[a-zA-Z0-9]+$/;
          if (regex.test(firstChar)) existing.content += " " + item.text.trim();
          else existing.content += item.text.trim();
        } else {
          result.push({
            translationKey,
            verseKey: item.attrs.verseId,
            verseNumber: verse,
            content: item.text.trim(),
            newParagraph: parent.name === "para" && index === 0
          });
        }
      }
    }

    if (item.items) {
      item.items.forEach((i: any, idx: number) => {
        this.parseVerseItem(i, item, idx, result, translationKey);
      });
    }
  }

  static async getContent(url: string) {
    const resp = await axios.get(url, {
      headers: { "api-key": Environment.apiBibleKey }
    });
    const json: any = resp.data;
    return json;
  }
}
