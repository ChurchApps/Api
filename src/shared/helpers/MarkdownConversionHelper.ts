import { Element } from "../../modules/content/models/Element";
import { MarkdownPreviewLight } from "./MarkdownPreviewLight";
import { DB } from "../infrastructure/DB";

/**
 * TEMPORARY helper for converting markdown content to HTML in Elements
 * This is a one-time conversion utility
 */
export class MarkdownConversionHelper {
  /**
   * Convert markdown content to HTML for specific element types
   * @param churchId - The church ID to filter elements by
   * @param elementTypes - Array of element types to process (default: ['text', 'textWithPhoto', 'card', 'faq', 'table'])
   * @param batchSize - Number of elements to process per batch (default: 20)
   */
  static async convertMarkdownToHtml(
    churchId: string,
    elementTypes: string[] = ["text", "textWithPhoto", "card", "faq", "table"],
    batchSize: number = 20
  ): Promise<{
    processed: number;
    errors: number;
    totalElements: number;
    remaining: number;
    details: string[];
    batchResults: Array<{ batchNumber: number; processed: number; errors: number; remaining: number }>;
  }> {
    const results = {
      processed: 0,
      errors: 0,
      totalElements: 0,
      remaining: 0,
      details: [] as string[],
      batchResults: [] as Array<{ batchNumber: number; processed: number; errors: number; remaining: number }>
    };

    try {
      // Test database connection first
      results.details.push("Testing database connection...");
      const connectionTest = await DB.query("SELECT 1 as test", []);
      results.details.push(`Database connection test: ${connectionTest?.[0]?.test === 1 ? "SUCCESS" : "FAILED"}`);

      // Check what element types exist in database
      const elementTypesQuery = await DB.query("SELECT DISTINCT elementType, COUNT(*) as count FROM elements GROUP BY elementType ORDER BY count DESC LIMIT 10", []);
      results.details.push(`Available element types in DB: ${JSON.stringify(elementTypesQuery)}`);

      // Load all elements of specified types - for all churches if churchId is empty
      let elementsQuery: string;
      let params: any[];

      if (!churchId || churchId.trim() === "") {
        // Process all churches
        elementsQuery = `
          SELECT * FROM elements
          WHERE elementType IN (${elementTypes.map(() => "?").join(",")})
          ORDER BY churchId, id
        `;
        params = [...elementTypes];
        results.details.push(`Processing ALL churches for element types: ${elementTypes.join(", ")}`);
      } else {
        // Process specific church
        elementsQuery = `
          SELECT * FROM elements
          WHERE churchId = ? AND elementType IN (${elementTypes.map(() => "?").join(",")})
          ORDER BY id
        `;
        params = [churchId, ...elementTypes];
        results.details.push(`Processing church ${churchId} for element types: ${elementTypes.join(", ")}`);
      }

      console.log("MarkdownConversionHelper: About to execute query with params:", params);
      results.details.push(`Executing query with ${params.length} parameters: ${JSON.stringify(params)}`);

      const elements: Element[] = await DB.query(elementsQuery, params);

      console.log("MarkdownConversionHelper: Query executed, found elements:", elements?.length || 0);

      if (!elements || elements.length === 0) {
        const scope = !churchId || churchId.trim() === "" ? "all churches" : `church ${churchId}`;
        results.details.push(`No elements found for ${scope} with types: ${elementTypes.join(", ")}`);
        return results;
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

        // Process each element in the batch
        for (const element of batch) {
          try {
            // Parse the answersJSON to get the content
            let answers: any = {};
            if (element.answersJSON) {
              try {
                answers = JSON.parse(element.answersJSON);
              } catch (parseError) {
                batchErrors++;
                results.errors++;
                const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                results.details.push(`Error parsing answersJSON for element ${element.id}: ${errorMessage}`);
                console.error(`Error parsing answersJSON for element ${element.id}:`, parseError);
                continue;
              }
            }

            // Check if there's content to convert
            const hasContentToConvert = this.hasMarkdownContent(answers, element.elementType!);

            if (!hasContentToConvert) {
              results.details.push(`Element ${element.id} (${element.elementType}) has no markdown content to convert`);
              continue;
            }

            // Convert markdown to HTML
            const convertedAnswers = this.convertAnswersMarkdownToHtml(answers, element.elementType!);

            // Update the element
            const updatedElement = { ...element };
            updatedElement.answersJSON = JSON.stringify(convertedAnswers);

            // Save to database using direct query
            const updateSql = "UPDATE elements SET answersJSON=? WHERE id=? AND churchId=?";
            const updateParams = [updatedElement.answersJSON, element.id, element.churchId];
            await DB.query(updateSql, updateParams);

            batchProcessed++;
            results.processed++;
            results.details.push(`✓ Converted element ${element.id} (${element.elementType})`);
          } catch (elementError) {
            batchErrors++;
            results.errors++;
            const errorMessage = elementError instanceof Error ? `${elementError.message}\nStack: ${elementError.stack}` : String(elementError);
            results.details.push(`Error processing element ${element.id}: ${errorMessage}`);
            console.error(`Error processing element ${element.id}:`, elementError);
          }
        }

        // Update remaining count
        results.remaining = elements.length - (batchStart + batch.length);

        // Record batch results
        results.batchResults.push({
          batchNumber,
          processed: batchProcessed,
          errors: batchErrors,
          remaining: results.remaining
        });

        results.details.push(`Batch ${batchNumber} completed: ${batchProcessed} processed, ${batchErrors} errors, ${results.remaining} remaining`);
      }
    } catch (error) {
      results.errors++;
      const errorMessage = error instanceof Error ? `${error.message}\nStack: ${error.stack}` : String(error);
      results.details.push(`Fatal error during conversion: ${errorMessage}`);
      console.error("MarkdownConversionHelper fatal error:", error);
    }

    return results;
  }

  /**
   * Check if an element's answers contain markdown content that needs conversion
   */
  private static hasMarkdownContent(answers: any, elementType: string): boolean {
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
        // Tables might have markdown in individual cells
        return !!(answers.data && Array.isArray(answers.data) && answers.data.length > 0);

      default:
        return false;
    }
  }

  /**
   * Convert markdown content to HTML within answers object based on element type
   */
  private static convertAnswersMarkdownToHtml(answers: any, elementType: string): any {
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
}
