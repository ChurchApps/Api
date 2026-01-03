import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { CuratedEvent } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class CuratedEventRepo extends ConfiguredRepo<CuratedEvent> {
  protected get repoConfig(): RepoConfig<CuratedEvent> {
    return {
      tableName: "curatedEvents",
      hasSoftDelete: false,
      columns: ["curatedCalendarId", "groupId", "eventId"]
    };
  }

  public async delete(churchId: string, id: string): Promise<any> {
    return TypedDB.query("DELETE FROM curatedEvents WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async load(churchId: string, id: string): Promise<CuratedEvent> {
    return TypedDB.queryOne("SELECT * FROM curatedEvents WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async loadAll(churchId: string): Promise<CuratedEvent[]> {
    return TypedDB.query("SELECT * FROM curatedEvents WHERE churchId=?;", [churchId]);
  }

  public deleteByEventId(churchId: string, curatedCalendarId: string, eventId: string) {
    return TypedDB.query("DELETE FROM curatedEvents WHERE curatedCalendarId=? AND eventId=? and churchId=?;", [curatedCalendarId, eventId, churchId]);
  }

  public deleteByGroupId(churchId: string, curatedCalendarId: string, groupId: string) {
    return TypedDB.query("DELETE FROM curatedEvents WHERE curatedCalendarId=? AND groupId=? and churchId=?;", [curatedCalendarId, groupId, churchId]);
  }

  public loadByCuratedCalendarId(churchId: string, curatedCalendarId: string) {
    return TypedDB.query("SELECT * FROM curatedEvents WHERE churchId=? AND curatedCalendarId=?;", [churchId, curatedCalendarId]);
  }

  public loadForEvents(curatedCalendarId: string, churchId: string) {
    const sql =
      "SELECT ce.id, ce.churchId, ce.curatedCalendarId, ce.groupId as curatedGroupId, ce.eventId, " +
      " e.groupId, e.title, e.description, e.start, e.end, e.allDay, e.recurrenceRule, e.visibility " +
      " FROM curatedEvents ce" +
      " INNER JOIN events e ON " +
      " (CASE" +
      " WHEN ce.eventId IS NULL THEN e.groupId=ce.groupId" +
      " ELSE e.id=ce.eventId" +
      " END)" +
      " where curatedCalendarId=? AND ce.churchId=? and e.visibility='public';";
    return TypedDB.query(sql, [curatedCalendarId, churchId]);
  }

  protected rowToModel(row: any): CuratedEvent {
    return {
      id: row.id,
      churchId: row.churchId,
      curatedCalendarId: row.curatedCalendarId,
      groupId: row.groupId,
      eventId: row.eventId
    };
  }
}
