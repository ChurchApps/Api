import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Conjunction } from "../models";

@injectable()
export class ConjunctionRepository {
  public save(conjunction: Conjunction) {
    return conjunction.id ? this.update(conjunction) : this.create(conjunction);
  }

  private async create(conjunction: Conjunction) {
    conjunction.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO conjunctions (id, churchId, automationId, parentId, groupType) VALUES (?, ?, ?, ?, ?);";
    const params = [
      conjunction.id,
      conjunction.churchId,
      conjunction.automationId,
      conjunction.parentId,
      conjunction.groupType
    ];
    await DB.query(sql, params);
    return conjunction;
  }

  private async update(conjunction: Conjunction) {
    const sql = "UPDATE conjunctions SET automationId=?, parentId=?, groupType=? WHERE id=? and churchId=?";
    const params = [
      conjunction.automationId,
      conjunction.parentId,
      conjunction.groupType,
      conjunction.id,
      conjunction.churchId
    ];
    await DB.query(sql, params);
    return conjunction;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM conjunctions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM conjunctions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadForAutomation(churchId: string, automationId: string) {
    return DB.query("SELECT * FROM conjunctions WHERE automationId=? AND churchId=?;", [automationId, churchId]);
  }
}
