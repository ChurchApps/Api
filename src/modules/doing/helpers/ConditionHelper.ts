import { Condition } from "../models/index.js";
import { getGivingModuleGateway, getMembershipModuleGateway } from "../../../shared/modules/index.js";

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
      case "giving": {
        const today = await this.churchToday(condition.churchId);
        // The giving module clamps the week counts and returns person ids only.
        let rule: { regularWeeks?: number; minWeeks?: number; lapsedWeeks?: number } = {};
        try { rule = JSON.parse(condition.fieldData || "{}"); } catch { /* defaults */ }
        condition.matchingIds = await getGivingModuleGateway().loadLapsedRegularGiverIds(condition.churchId || "", today.iso, { regularWeeks: rule.regularWeeks, minWeeks: rule.minWeeks, lapsedWeeks: rule.lapsedWeeks });
        break;
      }
      default: {
        // Relative values ({currentDay}, {currentMonth}...) resolve to the church's date; the stored condition keeps the token.
        let query: Condition = condition;
        if (condition.value?.startsWith("{")) query = { ...condition, value: this.resolveRelativeValue(condition.value, await this.churchToday(condition.churchId)) };
        condition.matchingIds = await getMembershipModuleGateway().loadIdsMatchingCondition(query as Condition & { churchId: string; field: string; operator: string });
        break;
      }
    }
    return condition;
  }

  public static resolveRelativeValue(value: string | undefined, today: ChurchToday): string | undefined {
    switch (value) {
      case "{currentDay}": return today.dayOfMonth.toString();
      case "{currentMonth}": return today.month.toString();
      case "{prevMonth}":
      case "{previousMonth}": return (today.month === 1 ? 12 : today.month - 1).toString();
      case "{nextMonth}": return (today.month === 12 ? 1 : today.month + 1).toString();
      default: return value;
    }
  }

  // Calendar parts of "now" in the church's time zone; the scheduler runs in UTC.
  public static async churchToday(churchId?: string): Promise<ChurchToday> {
    let timeZone: string | undefined;
    try {
      if (churchId) timeZone = (await getMembershipModuleGateway().loadChurch(churchId))?.timeZone || undefined;
    } catch { /* fall back to server time */ }
    let parts: Intl.DateTimeFormatPart[];
    try {
      parts = this.zonedParts(new Date(), timeZone);
    } catch {
      timeZone = undefined;
      parts = this.zonedParts(new Date(), undefined);
    }
    const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
    return {
      iso: `${get("year")}-${get("month")}-${get("day")}`,
      dayOfMonth: parseInt(get("day"), 10),
      dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) + 1,
      month: parseInt(get("month"), 10),
      hour: parseInt(get("hour"), 10) % 24,
      timeZone
    };
  }

  // Start of the current repeat period in church-local days, so the dedupe compares days rather than seconds:
  // daily = today, weekly = the last 7 days, monthly/yearly = since the day after the same date last month/year.
  public static periodStart(recurs: string | undefined, today: ChurchToday): Date | null {
    const [y, m, d] = today.iso.split("-").map((v) => parseInt(v, 10));
    let start: Date;
    switch (recurs) {
      case "daily": start = new Date(Date.UTC(y, m - 1, d)); break;
      case "weekly": start = new Date(Date.UTC(y, m - 1, d - 6)); break;
      case "monthly": start = new Date(Date.UTC(y, m - 2, d + 1)); break;
      case "yearly": start = new Date(Date.UTC(y - 1, m - 1, d + 1)); break;
      default: return null; // no repeat: any prior card dedups
    }
    return this.zonedMidnight(start, today.timeZone);
  }

  // The UTC instant of local midnight on the given calendar date (read from its UTC fields).
  private static zonedMidnight(date: Date, timeZone?: string): Date {
    const offsetAt = (instant: number) => {
      const parts = this.zonedParts(new Date(instant), timeZone);
      const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
      return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) - instant;
    };
    const target = date.getTime();
    let result = target - offsetAt(target);
    result = target - offsetAt(result);
    return new Date(result);
  }

  private static zonedParts(date: Date, timeZone?: string) {
    return new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
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

export interface ChurchToday { iso: string; dayOfMonth: number; dayOfWeek: number; month: number; hour: number; timeZone?: string }
