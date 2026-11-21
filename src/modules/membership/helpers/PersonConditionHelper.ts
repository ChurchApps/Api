import { ArrayHelper } from "@churchapps/apihelper";
import { SearchCondition } from "../models/index.js";
import { PersonHelper } from "./PersonHelper.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";

// Person-field condition semantics shared by /people/advancedSearch and the list
// rules engine, so derived fields (age, months, multi-column phone) match exactly.
export class PersonConditionHelper {
  public static apply(data: any[], conditions: SearchCondition[]) {
    let result = data;
    conditions.forEach((c) => { result = this.applyOne(result, c); });
    return result;
  }

  public static applyOne(data: any[], conditionIn: SearchCondition) {
    if (conditionIn.operator === "lastDays") return this.applyLastDays(data, conditionIn);
    // "notEquals" is the search screen's spelling of the helper's "notEqual".
    const c = conditionIn.operator === "notEquals" ? { ...conditionIn, operator: "notEqual" as const } : conditionIn;
    // in / notIn take a comma list for any field and match it as a set.
    if (c.operator === "in" || c.operator === "notIn") return this.applyList(data, c);
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
      case "birthDate":
      case "anniversary":
      case "dateAdded": {
        // These columns come off the row as Date objects while the posted value is a
        // "YYYY-MM-DD" string, so the default string compare lines up neither for equals
        // nor for ordering. Date-only strings compare exactly and still sort chronologically.
        const dateOnly = c.field + "DateOnly";
        data.forEach((p) => { p[dateOnly] = DateHelper.toMysqlDateOnly(p[c.field]) ?? ""; });
        // A person with no date on file satisfies no date comparison, so drop them rather
        // than let an empty string sort ahead of every real date.
        const dated = data.filter((p) => p[dateOnly] !== "");
        return ArrayHelper.getAllOperator(dated, dateOnly, DateHelper.toMysqlDateOnly(c.value) ?? "", c.operator);
      }
      case "phone": {
        const matched = ArrayHelper.getAllOperator(data, "homePhone", c.value, c.operator)
          .concat(ArrayHelper.getAllOperator(data, "workPhone", c.value, c.operator))
          .concat(ArrayHelper.getAllOperator(data, "mobilePhone", c.value, c.operator));
        const matchedSet = new Set(matched);
        return data.filter((p) => matchedSet.has(p));
      }
      default:
        return ArrayHelper.getAllOperator(data, c.field, c.value, c.operator);
    }
  }

  private static applyList(data: any[], c: SearchCondition) {
    const values = new Set((c.value || "").split(",").map((v) => v.trim().toLowerCase()).filter((v) => v !== ""));
    const include = c.operator === "in";
    if (values.size === 0) return include ? [] : data;
    return data.filter((p) => values.has(String(p[c.field] ?? "").toLowerCase()) === include);
  }

  // "In the last N days": on or after the date N days before today. Undated people never match.
  private static applyLastDays(data: any[], c: SearchCondition) {
    const days = parseInt(c.value, 10);
    if (isNaN(days) || days < 0) return [];
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startDateOnly = DateHelper.toMysqlDateOnly(start)!;
    const todayDateOnly = DateHelper.toMysqlDateOnly(new Date())!;
    return data.filter((p) => {
      const d = DateHelper.toMysqlDateOnly(p[c.field]);
      return !!d && d >= startDateOnly && d <= todayDateOnly;
    });
  }
}
