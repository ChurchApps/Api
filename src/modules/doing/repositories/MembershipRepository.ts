import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { Condition } from "../models";

@injectable()
export class MembershipRepository {
  private getDBField(condition: Condition) {
    const fieldData = condition.fieldData ? JSON.parse(condition.fieldData) : {};
    let result = condition.field;
    switch (fieldData.datePart) {
      case "dayOfWeek":
        result = "dayOfWeek(" + condition.field + ")";
        break;
      case "dayOfMonth":
        result = "dayOfMonth(" + condition.field + ")";
        break;
      case "month":
        result = "month(" + condition.field + ")";
        break;
      case "years":
        result = "TIMESTAMPDIFF(YEAR, " + condition.field + ", CURDATE())";
        break;
    }

    return result;
  }

  private getDBValue(condition: Condition) {
    let result = condition.value;
    switch (condition.value) {
      case "{currentMonth}":
        result = (new Date().getMonth() + 1).toString();
        break;
      case "{prevMonth}":
        result = new Date().getMonth().toString();
        if (result === "0") result = "12";
        break;
      case "{nextMonth}":
        result = (new Date().getMonth() + 2).toString();
        if (result === "13") result = "1";
        break;
    }
    return result;
  }

  public async loadIdsMatchingCondition(condition: Condition) {
    let sql = "select id from people where churchId = ? AND removed = 0 AND ";
    const params = [condition.churchId];
    sql += this.getDBField(condition) + " " + condition.operator + " ?";
    params.push(this.getDBValue(condition));

    const result: string[] = [];
    const rows = (await DB.query(sql, params)) as { id: string }[];
    rows.forEach((r: { id: string }) => result.push(r.id));
    return result;
  }

  public async loadPeople(churchId: string, personIds: string[]) {
    const sql = "select id, displayName from people where churchId = ? AND removed = 0 AND id in (?)";
    const params = [churchId, personIds];
    return DB.query(sql, params);
  }
}
