import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Notification } from "../models";

export class NotificationRepository {
  public loadById(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM notifications WHERE id=? and churchId=?;", [id, churchId]);
  }

  public loadByPersonId(churchId: string, personId: string) {
    return DB.query("SELECT * FROM notifications WHERE churchId=? AND personId=? ORDER BY timeSent DESC", [
      churchId,
      personId
    ]);
  }

  public loadForEmail(frequency: string) {
    const sql =
      "SELECT DISTINCT n.churchId, n.personId" +
      " FROM notifications n" +
      " INNER JOIN notificationPreferences np on np.churchId=n.churchId and np.personId=n.personId" +
      " WHERE n.deliveryMethod='email' AND np.emailFrequency=? AND n.timeSent>DATE_SUB(NOW(), INTERVAL 24 HOUR)" +
      " LIMIT 200";
    return DB.query(sql, [frequency]);
  }

  public loadByPersonIdForEmail(churchId: string, personId: string, frequency: string) {
    let timeCutoff = "DATE_SUB(NOW(), INTERVAL 24 HOUR)";
    if (frequency === "individual") timeCutoff = "DATE_SUB(NOW(), INTERVAL 30 MINUTE)";
    const sql =
      "SELECT * FROM notifications WHERE churchId=? AND personId=? AND deliveryMethod='email' AND timeSent>=" +
      timeCutoff +
      " ORDER BY timeSent";
    return DB.query(sql, [churchId, personId]);
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM notifications WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async markRead(churchId: string, personId: string) {
    const sql = "UPDATE notifications SET isNew=0 WHERE churchId=? AND personId=?;";
    const params = [churchId, personId];
    await DB.query(sql, params);
  }

  public save(notification: Notification) {
    return notification.id ? this.update(notification) : this.create(notification);
  }

  private async create(notification: Notification): Promise<Notification> {
    notification.id = UniqueIdHelper.shortId();
    const sql =
      "INSERT INTO notifications (id, churchId, personId, contentType, contentId, timeSent, isNew, message, link, deliveryMethod) VALUES (?, ?, ?, ?, ?, NOW(), 1, ?, ?, ?);";
    const params = [
      notification.id,
      notification.churchId,
      notification.personId,
      notification.contentType,
      notification.contentId,
      notification.message,
      notification.link,
      notification.deliveryMethod
    ];
    await DB.query(sql, params);
    return notification;
  }

  private async update(notification: Notification) {
    const sql =
      "UPDATE notifications SET contentType=?, contentId=?, isNew=?, message=?, link=?, deliveryMethod=? WHERE id=? AND churchId=?;";
    const params = [
      notification.contentType,
      notification.contentId,
      notification.isNew,
      notification.message,
      notification.link,
      notification.deliveryMethod,
      notification.id,
      notification.churchId
    ];
    await DB.query(sql, params);
    return notification;
  }

  public convertToModel(data: any) {
    const result: Notification = {
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
    return result;
  }

  public convertAllToModel(data: any[]) {
    const result: Notification[] = [];
    data.forEach((d) => result.push(this.convertToModel(d)));
    return result;
  }

  public loadUndelivered() {
    const sql = "SELECT * FROM notifications WHERE deliveryMethod IS NULL OR deliveryMethod=''";
    return DB.query(sql, []);
  }

  public loadExistingUnread(churchId: string, contentType: string, contentId: string) {
    const sql = "SELECT * FROM notifications WHERE churchId=? AND contentType=? AND contentId=? AND isNew=1";
    return DB.query(sql, [churchId, contentType, contentId]);
  }
}
