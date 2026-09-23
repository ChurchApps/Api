import { ArrayHelper } from "@churchapps/apihelper";
import { Query, Report } from "../models/index.js";

export class ReportResultHelper {
  public static combineResults(report: Report) {
    const result: any[] = [];

    const mainQuery: Query = ArrayHelper.getOne(report.queries, "keyName", "main");
    if (!mainQuery?.value) return result;

    mainQuery.value.forEach((row) => {
      const combinedRow = { ...row };

      report.queries?.forEach((q) => {
        if (q.keyName !== "main" && q.value) {
          const relatedData = this.findRelatedData(combinedRow, q);
          if (relatedData) {
            Object.assign(combinedRow, relatedData);
          }
        }
      });

      result.push(combinedRow);
    });

    return result;
  }

  // Merges the related row the query's joinConditions point at, as "<keyName>.<field>" plus any field the row lacks.
  private static findRelatedData(row: any, query: Query): any {
    const conditions = query.joinConditions || [];
    if (conditions.length === 0) return null;
    const match = query.value.find((data) => conditions.every((c) => data[c.child] === row[c.parent]));
    if (!match) return null;

    const result: any = {};
    Object.keys(match).forEach((key) => {
      result[query.keyName + "." + key] = match[key];
      if (!(key in row)) result[key] = match[key];
    });
    return result;
  }
}
