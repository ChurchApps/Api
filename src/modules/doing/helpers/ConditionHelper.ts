import { Condition } from "../models/index.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

export class ConditionHelper {
  public static async getPeopleIdsMatchingConditions(conditions: Condition[]) {
    const promises: Promise<Condition>[] = [];
    conditions.forEach((c) => promises.push(ConditionHelper.getPeopleIdsMatchingCondition(c)));
    const result = await Promise.all(promises);
    return result;
  }

  private static async getPeopleIdsMatchingCondition(condition: Condition) {
    condition.matchingIds = [];
    switch (condition.field) {
      case "today": condition.matchingIds = this.evalSimpleCondition(condition, await this.churchToday(condition.churchId)) ? ["*"] : []; break;
      default: condition.matchingIds = await getMembershipModuleGateway().loadIdsMatchingCondition(condition as any); break;
    }
    return condition;
  }

  // Calendar parts of "now" in the church's time zone; the scheduler runs in UTC.
  private static async churchToday(churchId?: string): Promise<ChurchToday> {
    let timeZone: string | undefined;
    try {
      if (churchId) timeZone = (await getMembershipModuleGateway().loadChurch(churchId))?.timeZone || undefined;
    } catch { /* fall back to server time */ }
    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date());
    } catch {
      parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date());
    }
    const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
    return {
      iso: `${get("year")}-${get("month")}-${get("day")}`,
      dayOfMonth: parseInt(get("day"), 10),
      dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) + 1,
      month: parseInt(get("month"), 10)
    };
  }

  public static evalSimpleCondition(condition: Condition, today: ChurchToday) {
    let result = false;
    const fieldData = condition.fieldData ? JSON.parse(condition.fieldData) : {};

    switch (condition.field) {
      case "today":
        switch (fieldData.datePart) {
          case "dayOfMonth":
            result = ConditionHelper.evalNum(today.dayOfMonth, condition.operator || "", parseInt(condition.value || "0", 10));
            break;
          case "dayOfWeek":
            result = ConditionHelper.evalNum(today.dayOfWeek, condition.operator || "", parseInt(condition.value || "0", 10));
            break;
          case "month":
            result = ConditionHelper.evalNum(today.month, condition.operator || "", parseInt(condition.value || "0", 10));
            break;
          default:
            result = ConditionHelper.evalDate(today.iso, condition.operator || "", (condition.value || today.iso).substring(0, 10));
            break;
        }
        break;
    }
    return result;
  }

  private static evalNum(val: number, operator: string, testVal: number) {
    let result = false;
    switch (operator) {
      case "<": result = val < testVal; break;
      case "<=": result = val <= testVal; break;
      case "=": result = val === testVal; break;
      case "!=": result = val !== testVal; break;
      case ">=": result = val >= testVal; break;
      case ">": result = val > testVal; break;
    }
    return result;
  }

  // Compares YYYY-MM-DD strings, which sort the same as the dates they name.
  private static evalDate(val: string, operator: string, testVal: string) {
    let result = false;
    switch (operator) {
      case "<": result = val < testVal; break;
      case "<=": result = val <= testVal; break;
      case "=": result = val === testVal; break;
      case "!=": result = val !== testVal; break;
      case ">=": result = val >= testVal; break;
      case ">": result = val > testVal; break;
    }
    return result;
  }
}

interface ChurchToday { iso: string; dayOfMonth: number; dayOfWeek: number; month: number }
