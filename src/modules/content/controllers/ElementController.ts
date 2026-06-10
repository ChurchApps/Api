import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { Element } from "../models/index.js";
import { Permissions } from "../helpers/index.js";
import { ArrayHelper } from "@churchapps/apihelper";
import { TreeHelper } from "../helpers/TreeHelper.js";
import * as churchappsHelpers from "@churchapps/helpers";

@controller("/content/elements")
export class ElementController extends ContentBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.element.load(au.churchId, id);
    });
  }

  @httpPost("/duplicate/:id")
  public async duplicate(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const element = await this.repos.element.load(au.churchId, id);
        if (!element) return this.json({}, 404);
        const allElements: Element[] = await this.repos.element.loadForSection(element.churchId, element.sectionId);
        TreeHelper.getChildElements(element, allElements);
        const result = await TreeHelper.duplicateElement(element, element.sectionId, element.parentId);
        return result;
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Element[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const validationErrors = this.validateAnswers(req.body);
        if (validationErrors.length > 0) return this.json({ errors: validationErrors }, 400);
        const promises: Promise<Element>[] = [];
        req.body.forEach((element) => {
          element.churchId = au.churchId;
          promises.push(this.repos.element.save(element));
        });
        const result = await Promise.all(promises);
        if (req.body.length > 0) {
          if (req.body[0].blockId) await this.repos.element.updateSortForBlock(req.body[0].churchId, req.body[0].blockId, req.body[0].parentId);
          else await this.repos.element.updateSort(req.body[0].churchId, req.body[0].sectionId, req.body[0].parentId);
        }
        await this.checkRows(result);
        await this.checkSlides(result);
        return result;
      }
    });
  }

  // Rejects unparseable answersJSON (it would break tree loads) and, once the installed
  // @churchapps/helpers ships validateElementAnswers (>=1.7), type-level schema violations.
  private validateAnswers(elements: Element[]): string[] {
    const validate = (churchappsHelpers as any).validateElementAnswers;
    const errors: string[] = [];
    elements.forEach((element, index) => {
      ["stylesJSON", "animationsJSON"].forEach((field) => {
        const value = (element as any)[field];
        if (!value) return;
        try { JSON.parse(value); } catch { errors.push("elements[" + index + "]: " + field + " is not valid JSON"); }
      });
      if (!element.answersJSON) return;
      let answers: unknown;
      try {
        answers = JSON.parse(element.answersJSON);
      } catch {
        errors.push("elements[" + index + "]: answersJSON is not valid JSON");
        return;
      }
      if (typeof validate === "function" && element.elementType) {
        validate(element.elementType, answers).forEach((e: string) => errors.push("elements[" + index + "]: " + e));
      }
    });
    return errors;
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await this.repos.element.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  private async checkSlides(elements: Element[]) {
    for (const element of elements) {
      if (element.elementType === "carousel") {
        element.answers = JSON.parse(element.answersJSON);
        const slidesNumber = parseInt(element.answers.slides, 0);
        const slides: number[] = [];
        for (let i = 0; i < slidesNumber; i++) {
          slides.push(i);
        }
        const allElements: Element[] = await this.repos.element.loadForSection(element.churchId, element.sectionId);
        const children = ArrayHelper.getAll(allElements, "parentId", element.id);
        await this.checkSlide(element, children, slides);
      }
    }
  }

  private async checkSlide(row: Element, children: Element[], slides: number[]) {
    // Add new slides
    if (slides.length > children.length) {
      for (let i = children.length; i < slides.length; i++) {
        const answers = { slide: slides[i] };
        const column: Element = {
          churchId: row.churchId,
          sectionId: row.sectionId,
          blockId: row.blockId,
          elementType: "carousel",
          sort: i + 1,
          parentId: row.id,
          answersJSON: JSON.stringify(answers),
          elements: []
        };
        await this.repos.element.save(column);
      }
    }

    // Delete slides
    if (children.length > slides.length) {
      for (let i = slides.length; i < children.length; i++) await this.repos.element.delete(children[i].churchId, children[i].id);
    }
  }

  // Tolerates comma strings, arrays (older saves round-tripped `[]` back into answersJSON), and missing values.
  private parseNumberList(value: any): number[] {
    if (typeof value === "string" && value.length > 0) return value.split(",").map((c: string) => parseInt(c, 0)).filter((n: number) => !isNaN(n));
    if (Array.isArray(value)) return value.map((c: any) => parseInt(c, 0)).filter((n: number) => !isNaN(n));
    return [];
  }

  private async checkRows(elements: Element[]) {
    for (const element of elements) {
      if (element.elementType === "row") {
        element.answers = JSON.parse(element.answersJSON);
        const cols: number[] = this.parseNumberList(element.answers.columns);
        let mobileSizes: number[] = this.parseNumberList(element.answers.mobileSizes);
        if (mobileSizes.length !== cols.length) { mobileSizes = []; delete element.answers.mobileSizes; }
        let mobileOrder: number[] = this.parseNumberList(element.answers.mobileOrder);
        if (mobileOrder.length !== cols.length) { mobileOrder = []; delete element.answers.mobileOrder; }

        const allElements: Element[] = await this.repos.element.loadForSection(element.churchId, element.sectionId);
        const children = ArrayHelper.getAll(allElements, "parentId", element.id);
        await this.checkRow(element, children, cols, mobileSizes, mobileOrder);
      }
    }
  }

  private async checkRow(row: Element, children: Element[], cols: number[], mobileSizes: number[], mobileOrder: number[]) {
    // Delete existing columns that should no longer exist
    if (children.length > cols.length) {
      for (let i = cols.length; i < children.length; i++) await this.repos.element.delete(children[i].churchId, children[i].id);
    }

    // Update existing column sizes
    for (let i = 0; i < children.length && i < cols.length; i++) {
      children[i].answers = JSON.parse(children[i].answersJSON);
      let shouldSave = false;
      if (children[i].answers.size !== cols[i] || children[i].sort !== i + 1) {
        children[i].answers.size = cols[i];
        children[i].sort = i + 1;
        shouldSave = true;
      }
      const desiredMobileSize = mobileSizes.length > i ? mobileSizes[i] : undefined;
      if (children[i].answers.mobileSize !== desiredMobileSize) {
        if (desiredMobileSize === undefined) delete children[i].answers.mobileSize;
        else children[i].answers.mobileSize = desiredMobileSize;
        shouldSave = true;
      }
      const desiredMobileOrder = mobileOrder.length > i ? mobileOrder[i] : undefined;
      if (children[i].answers.mobileOrder !== desiredMobileOrder) {
        if (desiredMobileOrder === undefined) delete children[i].answers.mobileOrder;
        else children[i].answers.mobileOrder = desiredMobileOrder;
        shouldSave = true;
      }
      if (shouldSave) {
        children[i].answersJSON = JSON.stringify(children[i].answers);
        await this.repos.element.save(children[i]);
      }
    }

    // Add new columns
    if (cols.length > children.length) {
      for (let i = children.length; i < cols.length; i++) {
        const answers: any = { size: cols[i] };
        if (mobileSizes.length > i) answers.mobileSize = mobileSizes[i];
        if (mobileOrder.length > i) answers.mobileOrder = mobileOrder[i];
        const column: Element = {
          churchId: row.churchId,
          sectionId: row.sectionId,
          blockId: row.blockId,
          elementType: "column",
          sort: i + 1,
          parentId: row.id,
          answersJSON: JSON.stringify(answers),
          elements: []
        };
        await this.repos.element.save(column);
        // populate row.elements here too, so it's available in the POST response.
        if (row?.elements) {
          row.elements.push(column);
        } else {
          row.elements = [column];
        }
      }
    }
  }
}
