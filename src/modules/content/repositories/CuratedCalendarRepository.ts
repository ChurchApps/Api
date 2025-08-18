import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { CuratedCalendar } from "../models";

@injectable()
export class CuratedCalendarRepository {
  public save(curatedCalendar: CuratedCalendar) {
    return curatedCalendar.id ? this.update(curatedCalendar) : this.create(curatedCalendar);
  }

  private async create(curatedCalendar: CuratedCalendar) {
    curatedCalendar.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO curatedCalendars (id, churchId, name) VALUES (?, ?, ?);";
    const params = [curatedCalendar.id, curatedCalendar.churchId, curatedCalendar.name];
    await TypedDB.query(sql, params);
    return curatedCalendar;
  }

  private async update(curatedCalendar: CuratedCalendar) {
    const sql = "UPDATE curatedCalendars SET name=? WHERE id=? and churchId=?";
    const params = [curatedCalendar.name, curatedCalendar.id, curatedCalendar.churchId];
    await TypedDB.query(sql, params);
    return curatedCalendar;
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM curatedCalendars WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM curatedCalendars WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return TypedDB.query("SELECT * FROM curatedCalendars WHERE churchId=?;", [churchId]);
  }
}
