import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Condition } from "../models";

@injectable()
export class ConditionRepository {
  public save(condition: Condition) {
    return condition.id ? this.update(condition) : this.create(condition);
  }

  private async create(condition: Condition) {
    condition.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO conditions (id, churchId, conjunctionId, field, fieldData, operator, value, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [condition.id, condition.churchId, condition.conjunctionId, condition.field, condition.fieldData, condition.operator, condition.value, condition.label];
    await TypedDB.query(sql, params);
    return condition;
  }

  private async update(condition: Condition) {
    const sql = "UPDATE conditions SET conjunctionId=?, field=?, fieldData=?, operator=?, value=?, label=? WHERE id=? and churchId=?";
    const params = [condition.conjunctionId, condition.field, condition.fieldData, condition.operator, condition.value, condition.label, condition.id, condition.churchId];
    await TypedDB.query(sql, params);
    return condition;
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM conditions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM conditions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadForAutomation(churchId: string, automationId: string) {
    return TypedDB.query("SELECT * FROM conditions WHERE conjunctionId IN (SELECT id FROM conjunctions WHERE automationId=?) AND churchId=?;", [automationId, churchId]);
  }
}
