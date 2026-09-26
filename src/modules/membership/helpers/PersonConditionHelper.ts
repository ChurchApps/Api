import { ArrayHelper } from "@churchapps/apihelper";
import { SearchCondition } from "../models/index.js";
import { PersonHelper } from "./PersonHelper.js";

// Person-field condition semantics shared by /people/advancedSearch and the list
// rules engine, so derived fields (age, months, multi-column phone) match exactly.
export class PersonConditionHelper {
  public static apply(data: any[], conditions: SearchCondition[]) {
    let result = data;
    conditions.forEach((c) => { result = this.applyOne(result, c); });
    return result;
  }

  public static applyOne(data: any[], c: SearchCondition) {
    switch (c.field) {
      case "age":
        data.forEach((p) => { p.age = PersonHelper.getAge(p.birthDate); });
        return ArrayHelper.getAllOperator(data, "age", c.value, c.operator, "number");
      case "yearsMarried":
        data.forEach((p) => { p.yearsMarried = PersonHelper.getAge(p.anniversary); });
        return ArrayHelper.getAllOperator(data, "yearsMarried", c.value, c.operator, "number");
      case "birthMonth":
        data.forEach((p) => { p.birthMonth = PersonHelper.getBirthMonth(p.birthDate); });
        return ArrayHelper.getAllOperator(data, "birthMonth", c.value, c.operator, "number");
      case "anniversaryMonth":
        data.forEach((p) => { p.anniversaryMonth = PersonHelper.getBirthMonth(p.anniversary); });
        return ArrayHelper.getAllOperator(data, "anniversaryMonth", c.value, c.operator, "number");
      case "phone": {
        const matched = ArrayHelper.getAllOperator(data, "homePhone", c.value, c.operator)
          .concat(ArrayHelper.getAllOperator(data, "workPhone", c.value, c.operator))
          .concat(ArrayHelper.getAllOperator(data, "mobilePhone", c.value, c.operator));
        return ArrayHelper.getUnique(matched);
      }
      case "id":
        return ArrayHelper.getAllOperatorArray(data, c.field, c.value.split(","), c.operator);
      case "birthDate":
      case "anniversary":
        return this.filterByCalendarDate(data, c.field, c.value, c.operator);
      default:
        return ArrayHelper.getAllOperator(data, c.field, c.value, c.operator);
    }
  }

  // birthDate and anniversary are datetime columns, so rows carry Date objects while the
  // date picker sends "YYYY-MM-DD". Compare calendar dates, never the raw values.
  private static filterByCalendarDate(data: any[], field: string, value: string, operator: string) {
    const wanted = this.toCalendarDate(value);
    if (!wanted) return [];
    return data.filter((p) => {
      const have = this.toCalendarDate(p[field]);
      if (!have) return false;
      switch (operator) {
        case "equals": return have === wanted;
        case "greaterThan": return have > wanted;
        case "greaterThanEqual": return have >= wanted;
        case "lessThan": return have < wanted;
        case "lessThanEqual": return have <= wanted;
        default: return false;
      }
    });
  }

  /** "YYYY-MM-DD" for a Date (local calendar parts, as DateHelper.toMysqlDateOnly stores them) or a date string; null when absent or invalid. */
  private static toCalendarDate(v: unknown): string | null {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "string") {
      const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
    }
    const d = v instanceof Date ? v : new Date(v as string);
    if (isNaN(d.getTime())) return null;
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }
}
