import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { NotificationPreference } from "../models";

export class NotificationPreferenceRepository {
  public loadById(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM notificationPreferences WHERE id=? and churchId=?;", [id, churchId]);
  }

  public loadByPersonId(churchId: string, personId: string) {
    return DB.queryOne("SELECT * FROM notificationPreferences WHERE churchId=? AND personId=?", [churchId, personId]);
  }

  public loadByChurchId(churchId: string) {
    return DB.query("SELECT * FROM notificationPreferences WHERE churchId=?", [churchId]);
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM notificationPreferences WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public save(notificationPreference: NotificationPreference) {
    return notificationPreference.id ? this.update(notificationPreference) : this.create(notificationPreference);
  }

  private async create(notificationPreference: NotificationPreference): Promise<NotificationPreference> {
    notificationPreference.id = UniqueIdHelper.shortId();
    const sql =
      "INSERT INTO notificationPreferences (id, churchId, personId, allowPush, emailFrequency) VALUES (?, ?, ?, ?, ?);";
    const params = [
      notificationPreference.id,
      notificationPreference.churchId,
      notificationPreference.personId,
      notificationPreference.allowPush,
      notificationPreference.emailFrequency
    ];
    await DB.query(sql, params);
    return notificationPreference;
  }

  private async update(notificationPreference: NotificationPreference) {
    const sql =
      "UPDATE notificationPreferences SET personId=?, allowPush=?, emailFrequency=? WHERE id=? AND churchId=?;";
    const params = [
      notificationPreference.personId,
      notificationPreference.allowPush,
      notificationPreference.emailFrequency,
      notificationPreference.id,
      notificationPreference.churchId
    ];
    await DB.query(sql, params);
    return notificationPreference;
  }

  public convertToModel(data: any) {
    const result: NotificationPreference = {
      id: data.id,
      churchId: data.churchId,
      personId: data.personId,
      allowPush: data.allowPush,
      emailFrequency: data.emailFrequency
    };
    return result;
  }

  public convertAllToModel(data: any[]) {
    const result: NotificationPreference[] = [];
    data.forEach((d) => result.push(this.convertToModel(d)));
    return result;
  }

  public loadByPersonIds(personIds: string[]) {
    const sql = "SELECT * FROM notificationPreferences WHERE personId IN (?)";
    return DB.query(sql, [personIds]);
  }
}
