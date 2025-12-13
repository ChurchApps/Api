import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Notification } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";
import { injectable } from "inversify";

@injectable()
export class NotificationRepo extends ConfiguredRepo<Notification> {
  protected get repoConfig(): RepoConfig<Notification> {
    return {
      tableName: "notifications",
      hasSoftDelete: false,
      insertColumns: ["personId", "contentType", "contentId", "message", "link", "deliveryMethod"],
      updateColumns: ["contentType", "contentId", "isNew", "message", "link", "deliveryMethod"],
      insertLiterals: { timeSent: "NOW()", isNew: "1" }
    };
  }
  public loadById(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM notifications WHERE id=? and churchId=?;", [id, churchId]);
  }

  public loadByPersonId(churchId: string, personId: string) {
    return TypedDB.query("SELECT * FROM notifications WHERE churchId=? AND personId=? ORDER BY timeSent DESC", [churchId, personId]);
  }

  public loadForEmail(frequency: string) {
    const sql =
      "SELECT DISTINCT n.churchId, n.personId" +
      " FROM notifications n" +
      " INNER JOIN notificationPreferences np on np.churchId=n.churchId and np.personId=n.personId" +
      " WHERE n.deliveryMethod='email' AND np.emailFrequency=? AND n.timeSent>DATE_SUB(NOW(), INTERVAL 24 HOUR)" +
      " LIMIT 200";
    return TypedDB.query(sql, [frequency]);
  }

  public loadByPersonIdForEmail(churchId: string, personId: string, frequency: string) {
    let timeCutoff = "DATE_SUB(NOW(), INTERVAL 24 HOUR)";
    if (frequency === "individual") timeCutoff = "DATE_SUB(NOW(), INTERVAL 30 MINUTE)";
    const sql = "SELECT * FROM notifications WHERE churchId=? AND personId=? AND deliveryMethod='email' AND timeSent>=" + timeCutoff + " ORDER BY timeSent";
    return TypedDB.query(sql, [churchId, personId]);
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM notifications WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async markRead(churchId: string, personId: string) {
    const sql = "UPDATE notifications SET isNew=0, deliveryMethod='complete' WHERE churchId=? AND personId=?;";
    const params = [churchId, personId];
    await TypedDB.query(sql, params);
  }

  public async markAllRead(churchId: string, personId: string) {
    const sql = "UPDATE notifications SET isNew=0, deliveryMethod='complete' WHERE churchId=? AND personId=?;";
    const params = [churchId, personId];
    await TypedDB.query(sql, params);
  }

  public loadForPerson(churchId: string, personId: string) {
    return TypedDB.query("SELECT * FROM notifications WHERE churchId=? AND personId=? ORDER BY timeSent DESC", [churchId, personId]);
  }

  public async loadNewCounts(churchId: string, personId: string) {
    const sql =
      "SELECT (" +
      "  SELECT COUNT(*) FROM notifications where churchId=? and personId=? and isNew=1" +
      ") AS notificationCount, (" +
      "  SELECT COUNT(*) FROM privateMessages where churchId=? and notifyPersonId=?" +
      ") AS pmCount";
    const result: any = await TypedDB.queryOne(sql, [churchId, personId, churchId, personId]);
    return result.rows || result || {};
  }

  protected rowToModel(data: any): Notification {
    return {
      id: data.id,
      churchId: data.churchId,
      personId: data.personId,
      contentType: data.contentType,
      contentId: data.contentId,
      timeSent: data.timeSent,
      isNew: data.isNew,
      message: data.message,
      link: data.link,
      deliveryMethod: data.deliveryMethod
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any) {
    return this.mapToModels(data);
  }

  public loadUndelivered() {
    const sql = "SELECT * FROM notifications WHERE isNew=1 AND (deliveryMethod IS NULL OR deliveryMethod='' OR deliveryMethod='push' OR deliveryMethod='socket')";
    return TypedDB.query(sql, []);
  }

  public loadExistingUnread(churchId: string, contentType: string, contentId: string) {
    const sql = "SELECT * FROM notifications WHERE churchId=? AND contentType=? AND contentId=? AND isNew=1";
    return TypedDB.query(sql, [churchId, contentType, contentId]);
  }

  public loadPendingEscalation() {
    const sql = "SELECT * FROM notifications WHERE isNew=1 AND deliveryMethod IN ('socket', 'push')";
    return TypedDB.query(sql, []);
  }
}
