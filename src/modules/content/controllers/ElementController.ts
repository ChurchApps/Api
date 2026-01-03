import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { Element } from "../models/index.js";
import { Permissions } from "../helpers/index.js";
import { ArrayHelper } from "@churchapps/apihelper";
import { TreeHelper } from "../helpers/TreeHelper.js";

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

  private async checkRows(elements: Element[]) {
    for (const element of elements) {
      if (element.elementType === "row") {
        element.answers = JSON.parse(element.answersJSON);
        const cols: number[] = [];
        element.answers.columns.split(",").forEach((c: string) => cols.push(parseInt(c, 0)));
        const mobileSizes: number[] = [];
        element.answers.mobileSizes?.split(",").forEach((c: string) => mobileSizes.push(parseInt(c, 0)));
        if (mobileSizes.length !== cols.length) element.answers.mobileSizes = [];
        const mobileOrder: number[] = [];
        element.answers.mobileOrder?.split(",").forEach((c: string) => mobileOrder.push(parseInt(c, 0)));
        if (mobileOrder.length !== cols.length) element.answers.mobileOrder = [];

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
      if (children[i].answers.size !== cols[i] || children[i].sort !== i) {
        children[i].answers.size = cols[i];
        children[i].sort = i + 1;
        shouldSave = true;
      }
      if ((children[i].answers.mobileSize && mobileSizes.length < i) || (!children[i].answers.mobileSize && mobileSizes.length >= i) || children[i].answers.mobileSize !== mobileSizes[i]) {
        if (!children[i].answers.mobileSize) children[i].answers.mobileSize = [];
        if (mobileSizes.length < i) delete children[i].answers.mobileSize;
        else children[i].answers.mobileSize = mobileSizes[i];
        shouldSave = true;
      }
      if ((children[i].answers.mobileOrder && mobileOrder.length < i) || (!children[i].answers.mobileOrder && mobileOrder.length >= i) || children[i].answers.mobileOrder !== mobileOrder[i]) {
        if (!children[i].answers.mobileOrder) children[i].answers.mobileOrder = [];
        if (mobileOrder.length < i) delete children[i].answers.mobileOrder;
        else children[i].answers.mobileOrder = mobileOrder[i];
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
        const answers = { size: cols[i] };
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
