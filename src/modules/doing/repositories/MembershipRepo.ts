import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { Condition } from "../models/index.js";
import { BaseRepo } from "../../../shared/infrastructure/BaseRepo.js";

@injectable()
export class MembershipRepo extends BaseRepo<any> {
  protected tableName = "people";
  protected hasSoftDelete = false;

  protected async create(_model: any): Promise<any> {
    // This repository doesn't handle create operations
    throw new Error("Create operation not supported");
  }

  protected async update(_model: any): Promise<any> {
    // This repository doesn't handle update operations
    throw new Error("Update operation not supported");
  }
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
    const rows = (await TypedDB.query(sql, params)) as { id: string }[];
    rows.forEach((r: { id: string }) => result.push(r.id));
    return result;
  }

  public async loadPeople(churchId: string, personIds: string[]) {
    const sql = "select id, displayName from people where churchId = ? AND removed = 0 AND id in (?)";
    const params = [churchId, personIds];
    return TypedDB.query(sql, params);
  }
}
