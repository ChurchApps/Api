import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { CuratedEvent } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class CuratedEventRepository extends ConfiguredRepository<CuratedEvent> {
  protected get repoConfig(): RepoConfig<CuratedEvent> {
    return {
      tableName: "curatedEvents",
      hasSoftDelete: false,
      insertColumns: ["curatedCalendarId", "groupId", "eventId"],
      updateColumns: ["curatedCalendarId", "groupId", "eventId"]
    };
  }

  // Override to use TypedDB instead of DB
  protected async create(model: CuratedEvent): Promise<CuratedEvent> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    const { sql, params } = this.buildInsert(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: CuratedEvent): Promise<CuratedEvent> {
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
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
      "SELECT * " +
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
