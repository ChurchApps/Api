import { ArrayHelper } from "@churchapps/apihelper";
import { SearchCondition } from "../models/index.js";
import { PersonHelper } from "./PersonHelper.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";

// A people-table row (or a test fixture shaped like one); derived fields are written back onto it.
export interface PersonConditionRow {
  id?: string;
  birthDate?: Date | string | null;
  anniversary?: Date | string | null;
  [key: string]: unknown;
}

// Person-field condition semantics shared by /people/advancedSearch and the list
// rules engine, so derived fields (age, months, multi-column phone) match exactly.
export class PersonConditionHelper {
  public static apply<T extends PersonConditionRow>(data: T[], conditions: SearchCondition[]): T[] {
    let result = data;
    conditions.forEach((c) => { result = this.applyOne(result, c); });
    return result;
  }

  public static applyOne<T extends PersonConditionRow>(data: T[], c: SearchCondition): T[] {
    if (c.operator === "lastDays") return this.applyLastDays(data, c);
    switch (c.field) {
      case "age":
        data.forEach((p: PersonConditionRow) => { p.age = PersonHelper.getAge(p.birthDate as Date); });
        return ArrayHelper.getAllOperator(data, "age", c.value, c.operator, "number");
      case "yearsMarried":
        data.forEach((p: PersonConditionRow) => { p.yearsMarried = PersonHelper.getAge(p.anniversary as Date); });
        return ArrayHelper.getAllOperator(data, "yearsMarried", c.value, c.operator, "number");
      case "birthMonth":
        data.forEach((p: PersonConditionRow) => { p.birthMonth = PersonHelper.getBirthMonth(p.birthDate as Date); });
        return ArrayHelper.getAllOperator(data, "birthMonth", c.value, c.operator, "number");
      case "anniversaryMonth":
        data.forEach((p: PersonConditionRow) => { p.anniversaryMonth = PersonHelper.getBirthMonth(p.anniversary as Date); });
        return ArrayHelper.getAllOperator(data, "anniversaryMonth", c.value, c.operator, "number");
      case "birthDate":
      case "anniversary":
      case "dateAdded": {
        // These columns come off the row as Date objects while the posted value is a
        // "YYYY-MM-DD" string, so the default string compare lines up neither for equals
        // nor for ordering. Date-only strings compare exactly and still sort chronologically.
        const dateOnly = c.field + "DateOnly";
        data.forEach((p: PersonConditionRow) => { p[dateOnly] = DateHelper.toMysqlDateOnly(p[c.field] as Date | string | null) ?? ""; });
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
      case "id":
        return ArrayHelper.getAllOperatorArray(data, c.field, c.value.split(","), c.operator);
      default:
        return ArrayHelper.getAllOperator(data, c.field, c.value, c.operator);
    }
  }

  // "In the last N days": on or after the date N days before today. Undated people never match.
  private static applyLastDays<T extends PersonConditionRow>(data: T[], c: SearchCondition): T[] {
    const days = parseInt(c.value, 10);
    if (isNaN(days) || days < 0) return [];
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startDateOnly = DateHelper.toMysqlDateOnly(start)!;
    const todayDateOnly = DateHelper.toMysqlDateOnly(new Date())!;
    return data.filter((p) => {
      const d = DateHelper.toMysqlDateOnly(p[c.field] as Date | string | null);
      return !!d && d >= startDateOnly && d <= todayDateOnly;
    });
  }
}
