import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { Element, Section } from "../models/index.js";
import { Permissions } from "../helpers/index.js";
import { TreeHelper } from "../helpers/TreeHelper.js";
import * as churchappsHelpers from "@churchapps/helpers";

@controller("/content/sections")
export class SectionController extends ContentBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.section.load(au.churchId, id);
    });
  }

  @httpPost("/duplicate/:id")
  public async duplicate(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const { convertToBlock } = req.query;
        let section = await this.repos.section.load(au.churchId, id);
        const allElements: Element[] = await this.repos.element.loadForSection(section.churchId, section.id);
        section = TreeHelper.buildTree([section], allElements)[0];
        let result;
        if (convertToBlock && convertToBlock !== "") {
          result = await TreeHelper.convertToBlock(section, convertToBlock.toString());
        } else {
          result = await TreeHelper.duplicateSection(section);
        }
        return result;
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Section[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const validationErrors = this.validateJson(req.body);
        if (validationErrors.length > 0) return this.json({ errors: validationErrors }, 400);
        const promises: Promise<Section>[] = [];
        req.body.forEach((section) => {
          section.churchId = au.churchId;
          promises.push(this.repos.section.save(section));
        });
        const result = await Promise.all(promises);
        if (req.body.length > 0) {
          if (req.body[0].blockId) await this.repos.section.updateSortForBlock(req.body[0].churchId, req.body[0].blockId);
          else await this.repos.section.updateSort(req.body[0].churchId, req.body[0].pageId, req.body[0].zone);
        }
        TreeHelper.populateAnswers(result);
        return result;
      }
    });
  }

  // Creates a section plus its full nested element tree in one call (section templates, AI generation).
  @httpPost("/tree")
  public async saveTree(req: express.Request<{}, {}, { section: Section }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const section = req.body?.section;
      if (!section || (!section.pageId && !section.blockId)) return this.json({ errors: ["section with a pageId or blockId is required"] }, 400);
      const errors = this.validateJson([section]);
      this.collectElements(section.elements).forEach((element, index) => {
        this.validateElement(element, index).forEach((e) => errors.push(e));
      });
      if (errors.length > 0) return this.json({ errors }, 400);
      this.prepareTree(section, au.churchId);
      const result = await TreeHelper.duplicateSection(section);
      if (section.blockId) await this.repos.section.updateSortForBlock(au.churchId, section.blockId);
      else await this.repos.section.updateSort(au.churchId, section.pageId, section.zone);
      return result;
    });
  }

  private collectElements(elements: Element[], result: Element[] = []): Element[] {
    elements?.forEach((e) => {
      result.push(e);
      this.collectElements(e.elements, result);
    });
    return result;
  }

  private validateElement(element: Element, index: number): string[] {
    const errors: string[] = [];
    const validate = (churchappsHelpers as any).validateElementAnswers;
    ["answersJSON", "stylesJSON", "animationsJSON"].forEach((field) => {
      const value = (element as any)[field];
      if (!value) return;
      try { JSON.parse(value); } catch { errors.push("elements[" + index + "]: " + field + " is not valid JSON"); }
    });
    if (errors.length === 0 && element.answersJSON && typeof validate === "function" && element.elementType) {
      validate(element.elementType, JSON.parse(element.answersJSON)).forEach((e: string) => errors.push("elements[" + index + "]: " + e));
    }
    return errors;
  }

  private prepareTree(section: Section, churchId: string) {
    section.id = undefined;
    section.churchId = churchId;
    const prepareElement = (element: Element) => {
      element.id = undefined;
      element.churchId = churchId;
      element.blockId = section.blockId || undefined;
      element.elements?.forEach(prepareElement);
    };
    section.elements?.forEach(prepareElement);
  }

  // Unparseable JSON here breaks every subsequent tree load for the page.
  private validateJson(sections: Section[]): string[] {
    const errors: string[] = [];
    sections.forEach((section, index) => {
      ["answersJSON", "stylesJSON", "animationsJSON"].forEach((field) => {
        const value = (section as any)[field];
        if (!value) return;
        try { JSON.parse(value); } catch { errors.push("sections[" + index + "]: " + field + " is not valid JSON"); }
      });
    });
    return errors;
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const section = await this.repos.section.load(au.churchId, id);
        await this.repos.section.delete(au.churchId, id);
        if (section.blockId) {
          await this.repos.section.updateSortForBlock(section.churchId, section.blockId);
          return this.json({});
        } else {
          await this.repos.section.updateSort(section.churchId, section.pageId, section.zone);
          return this.json({});
        }
      }
    });
  }
}
