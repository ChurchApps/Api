import { DateHelper } from "@churchapps/apihelper";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { Event } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { injectable } from "inversify";

@injectable()
export class EventRepo extends ConfiguredRepo<Event> {
  protected get repoConfig(): RepoConfig<Event> {
    return {
      tableName: "events",
      hasSoftDelete: false,
      columns: [
        "groupId", "allDay", "start", "end", "title", "description", "visibility", "recurrenceRule"
      ]
    };
  }

  // Override to use TypedDB instead of DB
  protected async create(model: Event): Promise<Event> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    // Convert dates before insert
    if (m.start) {
      m.start = DateHelper.toMysqlDate(m.start);
    }
    if (m.end) {
      m.end = DateHelper.toMysqlDate(m.end);
    }
    const { sql, params } = this.buildInsert(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: Event): Promise<Event> {
    const m: any = model as any;
    // Convert dates before update
    if (m.start) {
      m.start = DateHelper.toMysqlDate(m.start);
    }
    if (m.end) {
      m.end = DateHelper.toMysqlDate(m.end);
    }
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
  }

  public async loadTimelineGroup(churchId: string, groupId: string, eventIds: string[]) {
    let sql = "select *, 'event' as postType, id as postId from events" + " where churchId=? AND ((" + " groupId = ?" + " and (end>curdate() or recurrenceRule IS NOT NULL)" + ")";
    if (eventIds.length > 0) sql += " OR id IN (?)";
    sql += ")";
    const params: any = [churchId, groupId];
    if (eventIds.length > 0) params.push(eventIds);
    const result = await TypedDB.query(sql, params);
    return result;
  }

  public async loadTimeline(churchId: string, groupIds: string[], eventIds: string[]) {
    let sql =
      "select *, 'event' as postType, id as postId from events" +
      " where churchId=? AND ((" +
      "  (" +
      "    groupId IN (?)" +
      "    OR groupId IN (SELECT groupId FROM curatedEvents WHERE churchId=? AND eventId IS NULL)" +
      "    OR id IN (SELECT eventId from curatedEvents WHERE churchId=?)" +
      "  )" +
      "  and (end>curdate() or recurrenceRule IS NOT NULL)" +
      ")";
    if (eventIds.length > 0) sql += " OR id IN (?)";
    sql += ")";
    const params = [churchId, groupIds, churchId, churchId];
    if (eventIds.length > 0) params.push(eventIds);
    const result = await TypedDB.query(sql, params);
    return result;
  }

  public async delete(churchId: string, id: string): Promise<any> {
    return TypedDB.query("DELETE FROM events WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async load(churchId: string, id: string): Promise<Event> {
    return TypedDB.queryOne("SELECT * FROM events WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async loadAll(churchId: string): Promise<Event[]> {
    return TypedDB.query("SELECT * FROM events WHERE churchId=? ORDER BY start;", [churchId]);
  }

  public loadForGroup(churchId: string, groupId: string) {
    return TypedDB.query("SELECT * FROM events WHERE groupId=? AND churchId=? order by start;", [groupId, churchId]);
  }

  public loadPublicForGroup(churchId: string, groupId: string) {
    return TypedDB.query("SELECT * FROM events WHERE groupId=? AND churchId=? and visibility='public' order by start;", [groupId, churchId]);
  }

  protected rowToModel(row: any): Event {
    return {
      id: row.id,
      churchId: row.churchId,
      groupId: row.groupId,
      allDay: row.allDay,
      start: row.start,
      end: row.end,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      recurrenceRule: row.recurrenceRule
    };
  }
}
