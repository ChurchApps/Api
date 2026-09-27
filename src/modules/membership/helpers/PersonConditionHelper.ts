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
      case "birthDate":
      case "anniversary": {
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
        return ArrayHelper.getUnique(matched);
      }
      case "id":
        return ArrayHelper.getAllOperatorArray(data, c.field, c.value.split(","), c.operator);
      default:
        return ArrayHelper.getAllOperator(data, c.field, c.value, c.operator);
    }
  }
}
