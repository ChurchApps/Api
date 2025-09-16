import { Repos } from "../repositories";
import { RepoManager } from "../../../shared/infrastructure";
import { Condition } from "../models";

export class ConditionHelper {
  public static async getPeopleIdsMatchingConditions(conditions: Condition[], repositories?: Repos) {
    const promises: Promise<Condition>[] = [];
    conditions.forEach((c) => promises.push(ConditionHelper.getPeopleIdsMatchingCondition(c, repositories)));
    const result = await Promise.all(promises);
    return result;
  }

  private static async getPeopleIdsMatchingCondition(condition: Condition, repositories?: Repos) {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    condition.matchingIds = [];
    switch (condition.field) {
      case "today":
        condition.matchingIds = this.evalSimpleCondition(condition) ? ["*"] : [];
        break;
      default:
        condition.matchingIds = await repos.membership.loadIdsMatchingCondition(condition);
        break;
    }
    return condition;
  }

  private static evalSimpleCondition(condition: Condition) {
    let result = false;
    const fieldData = condition.fieldData ? JSON.parse(condition.fieldData) : {};

    switch (condition.field) {
      case "today":
        switch (fieldData.datePart) {
          case "dayOfMonth": {
            const dom = new Date().getDate();
            result = ConditionHelper.evalNum(dom, condition.operator || "", parseInt(condition.value || "0", 0));
            break;
          }
          case "dayOfWeek": {
            const dow = new Date().getDay() + 1;
            result = ConditionHelper.evalNum(dow, condition.operator || "", parseInt(condition.value || "0", 0));
            break;
          }
          case "month": {
            const month = new Date().getMonth() + 1;
            result = ConditionHelper.evalNum(month, condition.operator || "", parseInt(condition.value || "0", 0));
            break;
          }
          default:
            result = ConditionHelper.evalDate(new Date(), condition.operator || "", new Date(condition.value || new Date()));
            break;
        }
        break;
    }
    return result;
  }

  private static evalNum(val: number, operator: string, testVal: number) {
    let result = false;
    switch (operator) {
      case "<":
        result = val < testVal;
        break;
      case "<=":
        result = val <= testVal;
        break;
      case "=":
        result = val === testVal;
        break;
      case "!=":
        result = val !== testVal;
        break;
      case ">=":
        result = val >= testVal;
        break;
      case ">":
        result = val > testVal;
        break;
    }
    return result;
  }

  private static evalDate(val: Date, operator: string, testVal: Date) {
    let result = false;
    switch (operator) {
      case "<":
        result = val < testVal;
        break;
      case "<=":
        result = val <= testVal;
        break;
      case "=":
        result = val === testVal;
        break;
      case "!=":
        result = val !== testVal;
        break;
      case ">=":
        result = val >= testVal;
        break;
      case ">":
        result = val > testVal;
        break;
    }
    return result;
  }
}
