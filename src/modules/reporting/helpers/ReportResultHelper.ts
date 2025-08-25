import { ArrayHelper } from "@churchapps/apihelper";
import { Query, Report } from "../models";

export class ReportResultHelper {
  public static combineResults(report: Report) {
    const result: any[] = [];
    
    const mainQuery: Query = ArrayHelper.getOne(report.queries, "keyName", "main");
    if (!mainQuery?.value) return result;
    
    mainQuery.value.forEach((row) => {
      const combinedRow = { ...row };
      
      report.queries?.forEach((q) => {
        if (q.keyName !== "main" && q.value) {
          const relatedData = this.findRelatedData(row, q.value, report);
          if (relatedData) {
            Object.assign(combinedRow, relatedData);
          }
        }
      });
      
      result.push(combinedRow);
    });
    
    return result;
  }
  
  private static findRelatedData(mainRow: any, queryData: any[], report: Report): any {
    const result: any = {};
    
    queryData.forEach((data) => {
      const keys = Object.keys(data);
      keys.forEach((key) => {
        if (!result[key]) {
          result[key] = data[key];
        }
      });
    });
    
    return result;
  }
}