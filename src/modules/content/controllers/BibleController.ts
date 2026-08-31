import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { BibleSourceFactory } from "../helpers/BibleSourceFactory.js";
import { Permissions } from "../helpers/index.js";
import { BibleTranslation, BibleVerseText } from "../models/index.js";

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
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const { source, sourceKey } = await this.resolveTranslation(translationKey);
      const result = await BibleSourceFactory.search(source, sourceKey, query, limit);
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
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const translations = await this.repos.bibleTranslation.loadNeedingCopyrights();
      for (const translation of translations) {
        const copyright = await BibleSourceFactory.getCopyright(translation.source || "api.bible", translation.sourceKey);
        translation.copyright = copyright || "";
        await this.repos.bibleTranslation.save(translation);
      }
      return [];
    });
  }

  @httpGet("/:translationKey/updateCopyright")
  public async updateCopyright(@requestParam("translationKey") translationKey: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const { source, sourceKey, translation } = await this.resolveTranslation(translationKey);
      if (!translation) return this.json({}, 404);
      const copyright = await BibleSourceFactory.getCopyright(source, sourceKey);
      translation.copyright = copyright || "";
      await this.repos.bibleTranslation.save(translation);
      return translation;
    });
  }

  @httpGet("/:translationKey/books")
  public async getBooks(@requestParam("translationKey") translationKey: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const { source, sourceKey } = await this.resolveTranslation(translationKey);
      let result = await this.repos.bibleBook.loadAll(sourceKey);
      if (result.length === 0) {
        result = await BibleSourceFactory.getBooks(source, sourceKey);
        result.forEach((r: any) => { r.translationKey = sourceKey; });
        await this.repos.bibleBook.saveAll(result);
      }
      return result;
    });
  }

  @httpGet("/:translationKey/:bookKey/chapters")
  public async getChapters(@requestParam("translationKey") translationKey: string, @requestParam("bookKey") bookKey: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const resolvedBookKey = await this.resolveBookKey(bookKey);
      const { source, sourceKey } = await this.resolveTranslation(translationKey);

      let result = await this.repos.bibleChapter.loadByBook(sourceKey, resolvedBookKey);
      if (result.length === 0) {
        result = await BibleSourceFactory.getChapters(source, sourceKey, resolvedBookKey);
        result.forEach((r: any) => { r.translationKey = sourceKey; });
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
      const { source, sourceKey } = await this.resolveTranslation(translationKey);
      let result = await this.repos.bibleVerse.loadByChapter(sourceKey, chapterKey);
      if (result.length === 0) {
        result = await BibleSourceFactory.getVerses(source, sourceKey, chapterKey);
        result.forEach((r: any) => { r.translationKey = sourceKey; });
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
      const { source, sourceKey } = await this.resolveTranslation(translationKey);
      const canCache = !this.noCache.includes(sourceKey);
      let result: BibleVerseText[] = [];
      const ipAddress = (req.headers["x-forwarded-for"] || req.socket.remoteAddress).toString().split(",")[0];
      this.logLookup(ipAddress, sourceKey, startVerseKey, endVerseKey);

      if (canCache) result = await this.repos.bibleVerseText.loadRange(sourceKey, startVerseKey, endVerseKey);
      if (result.length === 0) {
        result = await BibleSourceFactory.getVerseText(source, sourceKey, startVerseKey, endVerseKey);
        if (canCache) {
          result.forEach((r: BibleVerseText) => {
            const parts = r.verseKey.split(".");
            r.bookKey = parts[0];
            r.chapterNumber = parseInt(parts[1], 0);
            r.verseNumber = parseInt(parts[2], 0);
            r.translationKey = sourceKey;
          });
          await this.repos.bibleVerseText.saveAll(result);
        }
      }
      return result;
    });
  }

  @httpGet("/availableTranslations/:source")
  public async getAvailableTranslations(@requestParam("source") source: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const available = await BibleSourceFactory.getAvailableTranslations(source);
      return available.map((t: BibleTranslation) => ({ abbreviation: t.abbreviation, name: t.name, language: t.language }));
    });
  }

  @httpGet("/updateTranslations/:source")
  public async updateTranslationsFromSource(@requestParam("source") source: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const dbResult = await this.repos.bibleTranslation.loadAll();
      const apiResult = await BibleSourceFactory.getTranslations(source);
      const toSave: BibleTranslation[] = [];

      apiResult.forEach((r: BibleTranslation) => {
        const existing = dbResult.find((d: BibleTranslation) => d.source === r.source && d.sourceKey === r.sourceKey);
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

  @httpGet("/updateTranslations")
  public async updateTranslations(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const dbResult = await this.repos.bibleTranslation.loadAll();
      const apiResult = await BibleSourceFactory.getAllTranslations();
      const toSave: BibleTranslation[] = [];

      apiResult.forEach((r: BibleTranslation) => {
        const existing = dbResult.find((d: BibleTranslation) => d.source === r.source && d.sourceKey === r.sourceKey);
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
        result = await BibleSourceFactory.getAllTranslations();
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
    const lookup = { translationKey, ipAddress, startVerseKey, endVerseKey };
    await this.repos.bibleLookup.save(lookup);
  }

  private async resolveTranslation(translationKey: string): Promise<{ source: string; sourceKey: string; translation?: BibleTranslation }> {
    const bySourceKey = await this.repos.bibleTranslation.loadBySourceKey(null, translationKey);
    if (bySourceKey?.source) return { source: bySourceKey.source, sourceKey: bySourceKey.sourceKey || translationKey, translation: bySourceKey };

    const byId = await this.repos.bibleTranslation.load(translationKey);
    if (byId?.source) return { source: byId.source, sourceKey: byId.sourceKey || translationKey, translation: byId };

    const byAbbreviation = await this.repos.bibleTranslation.loadByAbbreviation(translationKey);
    if (byAbbreviation?.source) return { source: byAbbreviation.source, sourceKey: byAbbreviation.sourceKey || translationKey, translation: byAbbreviation };

    if (translationKey.startsWith("YOUVERSION-") || /^\d+$/.test(translationKey)) {
      const sourceKey = translationKey.startsWith("YOUVERSION-") ? translationKey : "YOUVERSION-" + translationKey;
      return { source: "youversion", sourceKey };
    }
    return { source: "api.bible", sourceKey: translationKey };
  }

  // Book keys are 3 chars: LLL (e.g. GEN) or NLL (e.g. 1CO, 2TI)
  private async resolveBookKey(bookKeyOrId: string): Promise<string> {
    const isBookKey = /^([A-Z]{3}|[0-9][A-Z]{2})$/.test(bookKeyOrId);
    if (isBookKey) {
      return bookKeyOrId;
    }
    const book = await this.repos.bibleBook.load(bookKeyOrId);
    return book?.keyName || bookKeyOrId;
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
