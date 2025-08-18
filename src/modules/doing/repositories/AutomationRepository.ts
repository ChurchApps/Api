import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Automation } from "../models";

@injectable()
export class AutomationRepository {
  public save(automation: Automation) {
    return automation.id ? this.update(automation) : this.create(automation);
  }

  private async create(automation: Automation) {
    automation.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO automations (id, churchId, title, recurs, active) VALUES (?, ?, ?, ?, ?);";
    const params = [automation.id, automation.churchId, automation.title, automation.recurs, automation.active];
    await DB.query(sql, params);
    return automation;
  }

  private async update(automation: Automation) {
    const sql = "UPDATE automations SET title=?, recurs=?, active=? WHERE id=? and churchId=?";
    const params = [automation.title, automation.recurs, automation.active, automation.id, automation.churchId];
    await DB.query(sql, params);
    return automation;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM automations WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM automations WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM automations WHERE churchId=? ORDER BY title;", [churchId]);
  }

  public loadAllChurches() {
    return DB.query("SELECT * FROM automations;", []);
  }
}
