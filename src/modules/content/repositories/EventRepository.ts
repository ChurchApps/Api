import { UniqueIdHelper, DateHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { Event } from "../models";

export class EventRepository {
  public save(event: Event) {
    return event.id ? this.update(event) : this.create(event);
  }

  public async loadTimelineGroup(churchId: string, groupId: string, eventIds: string[]) {
    let sql =
      "select *, 'event' as postType, id as postId from events" +
      " where churchId=? AND ((" +
      " groupId = ?" +
      " and (end>curdate() or recurrenceRule IS NOT NULL)" +
      ")";
    if (eventIds.length > 0) sql += " OR id IN (?)";
    sql += ")";
    const params: any = [churchId, groupId, churchId, churchId];
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

  private async create(event: Event) {
    event.id = UniqueIdHelper.shortId();
    const start = DateHelper.toMysqlDate(event.start);
    const end = DateHelper.toMysqlDate(event.end);
    const sql =
      "INSERT INTO events (id, churchId, groupId, allDay, start, end, title, description, visibility, recurrenceRule) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      event.id,
      event.churchId,
      event.groupId,
      event.allDay,
      start,
      end,
      event.title,
      event.description,
      event.visibility,
      event.recurrenceRule
    ];
    await TypedDB.query(sql, params);
    return event;
  }

  private async update(event: Event) {
    const start = DateHelper.toMysqlDate(event.start);
    const end = DateHelper.toMysqlDate(event.end);
    const sql =
      "UPDATE events SET groupId=?, allDay=?, start=?, end=?, title=?, description=?, visibility=?, recurrenceRule=? WHERE id=? and churchId=?";
    const params = [
      event.groupId,
      event.allDay,
      start,
      end,
      event.title,
      event.description,
      event.visibility,
      event.recurrenceRule,
      event.id,
      event.churchId
    ];
    await TypedDB.query(sql, params);
    return event;
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM events WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM events WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadForGroup(churchId: string, groupId: string) {
    return TypedDB.query("SELECT * FROM events WHERE groupId=? AND churchId=? order by start;", [groupId, churchId]);
  }

  public loadPublicForGroup(churchId: string, groupId: string) {
    return TypedDB.query(
      "SELECT * FROM events WHERE groupId=? AND churchId=? and visibility='public' order by start;",
      [groupId, churchId]
    );
  }
}
