import express from "express";
import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import { Permissions, canViewPage, PUBLIC_VISIBILITY } from "../helpers/index.js";
import { TreeHelper } from "../helpers/TreeHelper.js";
import { Element, Page, Section } from "../models/index.js";
import { ContentBaseController } from "./ContentBaseController.js";

@controller("/content/pages")
export class PageController2 extends ContentBaseController {
  @httpGet("/:churchId/tree")
  public async getTree(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      let url = req.query.url as string;
      if (url && url[0] !== "/") {
        url = "/" + url;
      }
      const id = req.query.id as string;
      const page = id ? await this.repos.page.load(churchId, id) : await this.repos.page.loadByUrl(churchId, url);

      let result: Page = {};
      if (page?.id !== undefined) {
        // Only url-based (public render) requests are gated; the editor's id-based requests are unchanged.
        if (url && !canViewPage(page, this.authUser())) {
          return { restricted: true, visibility: page.visibility || PUBLIC_VISIBILITY };
        }
        result = page;
        // Public (url-based) requests serve the published snapshot when one exists; the
        // editor's id-based requests always see the working tree.
        const snapshot = url && page.publishedAt ? await this.loadPublishedSnapshot(churchId, page.id) : null;
        if (snapshot) {
          result.sections = snapshot.sections || [];
          const allElements = this.flattenTreeElements(result.sections);
          TreeHelper.populateAnswers(allElements);
          TreeHelper.populateAnswers(result.sections);
          await TreeHelper.insertBlocks(result.sections, allElements, churchId);
        } else {
          const sections = await this.repos.section.loadForPage(churchId, page.id);
          const allElements: Element[] = await this.repos.element.loadForPage(churchId, page.id);
          TreeHelper.populateAnswers(allElements);
          TreeHelper.populateAnswers(sections);
          result.sections = TreeHelper.buildTree(sections, allElements);
          await TreeHelper.insertBlocks(result.sections, allElements, churchId);
        }
        if (url) this.removeTreeFields(result);
      }
      return result;
    });
  }

  private async loadPublishedSnapshot(churchId: string, pageId: string): Promise<{ sections: Section[] } | null> {
    const published = await this.repos.page.loadPublished(churchId, pageId);
    if (!published?.publishedJSON) return null;
    try {
      return JSON.parse(published.publishedJSON);
    } catch {
      return null;
    }
  }

  private flattenTreeElements(sections: Section[]): Element[] {
    const result: Element[] = [];
    const collect = (elements?: Element[]) => {
      elements?.forEach((e) => {
        result.push(e);
        collect(e.elements);
      });
    };
    sections?.forEach((s) => collect(s.elements));
    return result;
  }

  @httpPost("/:id/publish")
  public async publish(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const page = await this.repos.page.load(au.churchId, id);
      if (!page) return this.json({}, 404);
      const sections = await this.repos.section.loadForPage(au.churchId, page.id);
      const allElements: Element[] = await this.repos.element.loadForPage(au.churchId, page.id);
      const tree = TreeHelper.buildTree(sections, allElements);
      const publishedAt = await this.repos.page.savePublished(au.churchId, page.id, JSON.stringify({ sections: tree }));
      return { publishedAt };
    });
  }

  @httpPost("/:id/discard")
  public async discard(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const snapshot = await this.loadPublishedSnapshot(au.churchId, id);
      if (!snapshot) return this.json({ error: "Page has no published version" }, 400);
      await TreeHelper.deleteAndRestoreContent(au.churchId, id, null, snapshot);
      return { success: true };
    });
  }

  @httpDelete("/:id/published")
  public async unpublish(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      await this.repos.page.savePublished(au.churchId, id, null);
      return this.json({});
    });
  }

  @httpGet("/public/:churchId")
  public async loadPublic(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const pages: Page[] = await this.repos.page.loadAll(churchId);
      return pages
        .filter((p) => (p.visibility || PUBLIC_VISIBILITY) === PUBLIC_VISIBILITY)
        .map((p) => ({ url: p.url, title: p.title, metaDescription: p.metaDescription }));
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.page.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.page.loadAll(au.churchId);
    });
  }

  @httpPost("/duplicate/:id")
  public async duplicate(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const page = await this.repos.page.load(au.churchId, id);
        page.id = undefined;
        page.title += " (copy)";
        page.url += "-copy";
        const newPage = await this.repos.page.save(page);
        const sections: Section[] = await this.repos.section.loadForPage(au.churchId, id);
        const allElements: Element[] = await this.repos.element.loadForPage(au.churchId, id);

        TreeHelper.populateAnswers(allElements);
        TreeHelper.populateAnswers(sections);
        newPage.sections = TreeHelper.buildTree(sections, allElements);

        sections.forEach((s) => {
          // s.id = undefined;
          s.pageId = newPage.id;
        });

        const promises: Promise<Section>[] = [];
        newPage.sections.forEach((s) => {
          promises.push(TreeHelper.duplicateSection(s));
        });
        await Promise.all(promises);

        return newPage;
      }
    });
  }

  @httpPost("/temp/ai")
  public async ai(req: express.Request<{}, {}, { page: Page; sections: Section[]; elements: Element[] }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Page>[] = [];
        promises.push(this.repos.page.save(req.body.page));
        req.body.sections.forEach((section) => {
          promises.push(this.repos.section.save(section));
        });
        req.body.elements.forEach((element) => {
          promises.push(this.repos.element.save(element));
        });
        const result = await Promise.all(promises);
        return result[0];
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Page[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Page>[] = [];
        req.body.forEach((page) => {
          page.churchId = au.churchId;
          promises.push(this.repos.page.save(page));
        });
        const result = await Promise.all(promises);
        return result;
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await this.repos.page.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  private removeTreeFields(page: Page) {
    delete page.id;
    delete page.churchId;
    delete page.groupIds;
    page.sections.forEach((s) => {
      delete s.id;
      delete s.churchId;
      delete s.pageId;
      delete s.sort;
      s.elements?.forEach((e) => {
        // delete e.id;
        delete e.churchId;
        delete e.sectionId;
        delete e.sort;
        delete e.answersJSON;
      });
    });
  }
}
