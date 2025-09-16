import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController";
import { ApiBibleHelper } from "../helpers/ApiBibleHelper";
import { BibleTranslation, BibleVerseText } from "../models";
import { ArrayHelper } from "@churchapps/apihelper";

@controller("/content/bibles")
export class BibleController extends ContentBaseController {
  noCache: string[] = [
    "a81b73293d3080c9-01", // AMP
    "e3f420b9665abaeb-01", // LBLA
    "a761ca71e0b3ddcf-01", // NASB2020
    "b8ee27bcd1cae43a-01", // NASB95
    "ce11b813f9a27e20-01" // NBLA
  ];

  @httpGet("/:translationKey/search")
  public async search(@requestParam("translationKey") translationKey: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const query = req.query.query as string;
      const result = await ApiBibleHelper.search(translationKey, query);
      return result;
    });
  }

  @httpGet("/stats")
  public async getStats(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const startDate = new Date(req.query.startDate.toString());
      const endDate = new Date(req.query.endDate.toString());
      const result = await this.repos.bibleLookup.getStats(startDate, endDate);
      return result;
    });
  }

  @httpGet("/updateCopyrights")
  public async updateCopyrights(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const translations = await this.repos.bibleTranslation.loadNeedingCopyrights();
      for (const translation of translations) {
        const copyright = await ApiBibleHelper.getCopyright(translation.sourceKey);
        translation.copyright = copyright || "";
        await this.repos.bibleTranslation.save(translation);
      }
      return [];
    });
  }

  @httpGet("/:translationKey/updateCopyright")
  public async updateCopyright(@requestParam("translationKey") translationKey: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const copyright = await ApiBibleHelper.getCopyright(translationKey);
      const bible = await this.repos.bibleTranslation.loadBySourceKey("api.bible", translationKey);
      bible.copyright = copyright || "";
      await this.repos.bibleTranslation.save(bible);
      return bible;
    });
  }

  @httpGet("/:translationKey/books")
  public async getBooks(@requestParam("translationKey") translationKey: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      let result = await this.repos.bibleBook.loadAll(translationKey);
      if (result.length === 0) {
        result = await ApiBibleHelper.getBooks(translationKey);
        await this.repos.bibleBook.saveAll(result);
      }
      return result;
    });
  }

  @httpGet("/:translationKey/:bookKey/chapters")
  public async getChapters(@requestParam("translationKey") translationKey: string, @requestParam("bookKey") bookKey: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      let result = await this.repos.bibleChapter.loadByBook(translationKey, bookKey);
      if (result.length === 0) {
        result = await ApiBibleHelper.getChapters(translationKey, bookKey);
        await this.repos.bibleChapter.saveAll(result);
      }
      return result;
    });
  }

  @httpGet("/:translationKey/chapters/:chapterKey/verses")
  public async getVerses(
    @requestParam("translationKey") translationKey: string,
    @requestParam("chapterKey") chapterKey: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      let result = await this.repos.bibleVerse.loadByChapter(translationKey, chapterKey);
      if (result.length === 0) {
        result = await ApiBibleHelper.getVerses(translationKey, chapterKey);
        await this.repos.bibleVerse.saveAll(result);
      }
      return result;
    });
  }

  @httpGet("/:translationKey/verses/:startVerseKey-:endVerseKey")
  public async getVerseText(
    @requestParam("translationKey") translationKey: string,
    @requestParam("startVerseKey") startVerseKey: string,
    @requestParam("endVerseKey") endVerseKey: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const canCache = !this.noCache.includes(translationKey);
      let result: BibleVerseText[] = [];
      const ipAddress = (req.headers["x-forwarded-for"] || req.socket.remoteAddress).toString().split(",")[0];
      this.logLookup(ipAddress, translationKey, startVerseKey, endVerseKey);

      if (canCache) result = await this.repos.bibleVerseText.loadRange(translationKey, startVerseKey, endVerseKey);
      if (result.length === 0) {
        result = await ApiBibleHelper.getVerseText(translationKey, startVerseKey, endVerseKey);
        if (canCache) {
          result.forEach((r: BibleVerseText) => {
            const parts = r.verseKey.split(".");
            r.bookKey = parts[0];
            r.chapterNumber = parseInt(parts[1], 0);
            r.verseNumber = parseInt(parts[2], 0);
          });
          await this.repos.bibleVerseText.saveAll(result);
        }
      }
      return result;
    });
  }

  @httpGet("/updateTranslations")
  public async updateTranslations(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const dbResult = await this.repos.bibleTranslation.loadAll();
      const apiResult = await ApiBibleHelper.getTranslations();
      const toSave: BibleTranslation[] = [];

      apiResult.forEach((r: BibleTranslation) => {
        const existing = ArrayHelper.getOne(dbResult, "sourceKey", r.sourceKey);
        if (!existing) {
          r.countryList = r.countries?.split(",").map((c: string) => c.trim());
          delete r.countries;
          toSave.push(r);
        }
      });

      await this.repos.bibleTranslation.saveAll(toSave);

      return toSave;
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      let result = await this.repos.bibleTranslation.loadAll();
      if (result.length === 0) {
        result = await ApiBibleHelper.getTranslations();
        await this.repos.bibleTranslation.saveAll(result);
      }
      result.forEach((r: BibleTranslation) => {
        r.countryList = r.countries?.split(",").map((c: string) => c.trim());
        delete r.countries;
      });
      return result;
    });
  }

  private async logLookup(ipAddress: string, translationKey: string, startVerseKey: string, endVerseKey: string) {
    const lookup = {
      translationKey,
      ipAddress,
      startVerseKey,
      endVerseKey
    };
    await this.repos.bibleLookup.save(lookup);
  }

  /*Start Old Code*/

  /*
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await this.repos.bible.load(id);
    });
  }*/
  /*
    @httpGet("/list")
    public async list(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
      return this.actionWrapper(req, res, async (au) => {
        return await ApiBibleHelper.list();
      });
    }




    @httpGet("/import/next")
    public async importNext(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
      return this.actionWrapperAnon(req, res, async () => {
        const apiList = await ApiBibleHelper.list();
        const translations = await this.repos.bibleTranslation.loadAll();
        let abbreviation = "";
        for (const api of apiList) {
          let found = false;
          for (const translation of translations) {
            if (api.abbreviation === translation.abbreviation) {
              found = true;
              break;
            }
          }
          if (!found) {
            abbreviation = api.abbreviation;
            break;
          }
        }
        await ApiBibleHelper.import(abbreviation);
        return { status: "done" };
      });
    }

    @httpGet("/import/:abbreviation")
    public async full(@requestParam("abbreviation") abbreviation: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
      return this.actionWrapperAnon(req, res, async () => {
        await ApiBibleHelper.import(abbreviation);

        return { status: "done" };
      });
    }
    */

  /*

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.element.load(au.churchId, id);
    });
  }
*/
}
