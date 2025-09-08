import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController";
import { Element } from "../models";
import { Permissions } from "../helpers";
import { ArrayHelper } from "@churchapps/apihelper";
import { TreeHelper } from "../helpers/TreeHelper";

@controller("/content/elements")
export class ElementController extends ContentBaseController {
  @httpGet("/convert-markdown")
  public async convertMarkdownToHtml(req: express.Request, res: express.Response): Promise<any> {
    const { MarkdownPreviewLight } = await import("../../../shared/helpers/MarkdownPreviewLight");
    const { TypedDB } = await import("../helpers");
    
    const results = {
      processed: 0,
      errors: 0,
      totalElements: 0,
      remaining: 0,
      details: [] as string[],
      batchResults: [] as Array<{ batchNumber: number; processed: number; errors: number; remaining: number }>
    };

    const elementTypes = ["text", "textWithPhoto", "card", "faq", "table"];
    const batchSize = 20;

    try {
      // Direct query using TypedDB (the context should be available since we're in the content module)
      const elementsQuery = `
        SELECT * FROM elements 
        WHERE elementType IN (${elementTypes.map(() => "?").join(",")})
        ORDER BY churchId, id
        LIMIT 100
      `;
      
      results.details.push(`Processing ALL churches for element types: ${elementTypes.join(', ')}`);
      results.details.push(`Querying with parameters: ${JSON.stringify(elementTypes)}`);
      
      const elements: Element[] = await TypedDB.query(elementsQuery, elementTypes);
      results.details.push(`Query executed successfully, found ${elements?.length || 0} elements`);
      
      if (!elements || elements.length === 0) {
        results.details.push(`No elements found for types: ${elementTypes.join(", ")}`);
        return res.json({
          success: true,
          totalElements: results.totalElements,
          processed: results.processed,
          errors: results.errors,
          remaining: results.remaining,
          batchResults: results.batchResults,
          details: results.details,
          message: "No elements found to convert"
        });
      }

      results.totalElements = elements.length;
      results.remaining = elements.length;
      results.details.push(`Found ${elements.length} elements to process in batches of ${batchSize}`);

      // Process elements in batches
      for (let batchStart = 0; batchStart < elements.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, elements.length);
        const batch = elements.slice(batchStart, batchEnd);
        const batchNumber = Math.floor(batchStart / batchSize) + 1;

        let batchProcessed = 0;
        let batchErrors = 0;

        results.details.push(`Processing batch ${batchNumber} (elements ${batchStart + 1}-${batchEnd})`);

        for (const element of batch) {
          try {
            let answers: any = {};
            if (element.answersJSON) {
              answers = JSON.parse(element.answersJSON);
            }

            const hasContentToConvert = this.hasMarkdownContent(answers, element.elementType!);

            if (!hasContentToConvert) {
              results.details.push(`Element ${element.id} (${element.elementType}) has no markdown content to convert`);
              continue;
            }

            const convertedAnswers = this.convertAnswersMarkdownToHtml(answers, element.elementType!, MarkdownPreviewLight);
            
            element.answersJSON = JSON.stringify(convertedAnswers);
            await this.repositories.element.save(element);

            batchProcessed++;
            results.processed++;
            results.details.push(`✓ Converted element ${element.id} (${element.elementType})`);
          } catch (elementError) {
            batchErrors++;
            results.errors++;
            const errorMessage = elementError instanceof Error ? elementError.message : String(elementError);
            results.details.push(`Error processing element ${element.id}: ${errorMessage}`);
          }
        }

        results.remaining = elements.length - (batchStart + batch.length);
        results.batchResults.push({
          batchNumber,
          processed: batchProcessed,
          errors: batchErrors,
          remaining: results.remaining
        });

        results.details.push(`Batch ${batchNumber} completed: ${batchProcessed} processed, ${batchErrors} errors, ${results.remaining} remaining`);
      }

      return res.json({
        success: true,
        totalElements: results.totalElements,
        processed: results.processed,
        errors: results.errors,
        remaining: results.remaining,
        batchResults: results.batchResults,
        details: results.details,
        message: `Conversion completed. Total: ${results.totalElements}, Processed: ${results.processed}, Errors: ${results.errors}`
      });

    } catch (error) {
      console.error('Convert markdown endpoint error:', error);
      results.errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.details.push(`Fatal error during conversion: ${errorMessage}`);
      
      return res.status(500).json({
        success: false,
        totalElements: results.totalElements,
        processed: results.processed,
        errors: results.errors,
        remaining: results.remaining,
        batchResults: results.batchResults,
        details: results.details,
        error: errorMessage,
        message: "Failed to convert markdown to HTML"
      });
    }
  }

  private hasMarkdownContent(answers: any, elementType: string): boolean {
    if (!answers) return false;

    switch (elementType) {
      case "text":
        return !!(answers.text && typeof answers.text === "string" && answers.text.trim().length > 0);
      case "textWithPhoto":
        return !!(answers.text && typeof answers.text === "string" && answers.text.trim().length > 0);
      case "card":
        return !!(answers.description && typeof answers.description === "string" && answers.description.trim().length > 0);
      case "faq":
        return !!(answers.answer && typeof answers.answer === "string" && answers.answer.trim().length > 0);
      case "table":
        return !!(answers.data && Array.isArray(answers.data) && answers.data.length > 0);
      default:
        return false;
    }
  }

  private convertAnswersMarkdownToHtml(answers: any, elementType: string, MarkdownPreviewLight: any): any {
    const convertedAnswers = { ...answers };

    switch (elementType) {
      case "text":
        if (convertedAnswers.text) {
          convertedAnswers.text = MarkdownPreviewLight({ value: convertedAnswers.text });
        }
        break;
      case "textWithPhoto":
        if (convertedAnswers.text) {
          convertedAnswers.text = MarkdownPreviewLight({ value: convertedAnswers.text });
        }
        break;
      case "card":
        if (convertedAnswers.description) {
          convertedAnswers.description = MarkdownPreviewLight({ value: convertedAnswers.description });
        }
        break;
      case "faq":
        if (convertedAnswers.answer) {
          convertedAnswers.answer = MarkdownPreviewLight({ value: convertedAnswers.answer });
        }
        break;
      case "table":
        if (convertedAnswers.data && Array.isArray(convertedAnswers.data)) {
          convertedAnswers.data = convertedAnswers.data.map((row: any[]) => {
            if (Array.isArray(row)) {
              return row.map((cell) => {
                if (typeof cell === "string" && cell.trim().length > 0) {
                  return MarkdownPreviewLight({ value: cell });
                }
                return cell;
              });
            }
            return row;
          });
        }
        break;
    }

    return convertedAnswers;
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.element.load(au.churchId, id);
    });
  }

  @httpPost("/duplicate/:id")
  public async duplicate(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const element = await this.repositories.element.load(au.churchId, id);
        const allElements: Element[] = await this.repositories.element.loadForSection(element.churchId, element.sectionId);
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
          promises.push(this.repositories.element.save(element));
        });
        const result = await Promise.all(promises);
        if (req.body.length > 0) {
          if (req.body[0].blockId) await this.repositories.element.updateSortForBlock(req.body[0].churchId, req.body[0].blockId, req.body[0].parentId);
          else await this.repositories.element.updateSort(req.body[0].churchId, req.body[0].sectionId, req.body[0].parentId);
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
        await this.repositories.element.delete(au.churchId, id);
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
        const allElements: Element[] = await this.repositories.element.loadForSection(element.churchId, element.sectionId);
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
          answersJSON: JSON.stringify(answers)
        };
        await this.repositories.element.save(column);
      }
    }

    // Delete slides
    if (children.length > slides.length) {
      for (let i = slides.length; i < children.length; i++) await this.repositories.element.delete(children[i].churchId, children[i].id);
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

        const allElements: Element[] = await this.repositories.element.loadForSection(element.churchId, element.sectionId);
        const children = ArrayHelper.getAll(allElements, "parentId", element.id);
        await this.checkRow(element, children, cols, mobileSizes, mobileOrder);
      }
    }
  }

  private async checkRow(row: Element, children: Element[], cols: number[], mobileSizes: number[], mobileOrder: number[]) {
    // Delete existing columns that should no longer exist
    if (children.length > cols.length) {
      for (let i = cols.length; i < children.length; i++) await this.repositories.element.delete(children[i].churchId, children[i].id);
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
        await this.repositories.element.save(children[i]);
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
          answersJSON: JSON.stringify(answers)
        };
        await this.repositories.element.save(column);
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
