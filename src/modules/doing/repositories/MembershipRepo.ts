import { injectable } from "inversify";
import { sql } from "kysely";
import { Condition } from "../models/index.js";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";

@injectable()
export class MembershipRepo {
  private getDb() {
    return KyselyPool.getDb("membership-doing");
  }

  private getDBField(condition: Condition) {
    const fieldData = condition.fieldData ? JSON.parse(condition.fieldData) : {};
    let result = condition.field;
    switch (fieldData.datePart) {
      case "dayOfWeek": result = "dayOfWeek(" + condition.field + ")"; break;
      case "dayOfMonth": result = "dayOfMonth(" + condition.field + ")"; break;
      case "month": result = "month(" + condition.field + ")"; break;
      case "years": result = "TIMESTAMPDIFF(YEAR, " + condition.field + ", CURDATE())"; break;
    }
    return result;
  }

  private getDBValue(condition: Condition) {
    let result = condition.value;
    switch (condition.value) {
      case "{currentMonth}": result = (new Date().getMonth() + 1).toString(); break;
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
    const dbField = this.getDBField(condition);
    const dbValue = this.getDBValue(condition);

    const rows = await sql`select id from people where churchId = ${condition.churchId} AND removed = 0 AND ${sql.raw(dbField)} ${sql.raw(condition.operator)} ${dbValue}`
      .execute(this.getDb()) as any;

    const result: string[] = [];
    (rows.rows as { id: string }[]).forEach((r) => result.push(r.id));
    return result;
  }

  public async loadPeople(churchId: string, personIds: string[]) {
    return sql`select id, displayName from people where churchId = ${churchId} AND removed = 0 AND id in (${sql.join(personIds)})`
      .execute(this.getDb())
      .then((r: any) => r.rows);
  }
}
