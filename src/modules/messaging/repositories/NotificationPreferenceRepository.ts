import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { NotificationPreference } from "../models";
import { CollectionHelper } from "../../../shared/helpers";

export class NotificationPreferenceRepository {
  public loadById(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM notificationPreferences WHERE id=? and churchId=?;", [id, churchId]);
  }

  public loadByPersonId(churchId: string, personId: string) {
    return TypedDB.queryOne("SELECT * FROM notificationPreferences WHERE churchId=? AND personId=?", [churchId, personId]);
  }

  public loadByChurchId(churchId: string) {
    return TypedDB.query("SELECT * FROM notificationPreferences WHERE churchId=?", [churchId]);
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM notificationPreferences WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public save(notificationPreference: NotificationPreference) {
    return notificationPreference.id ? this.update(notificationPreference) : this.create(notificationPreference);
  }

  private async create(notificationPreference: NotificationPreference): Promise<NotificationPreference> {
    notificationPreference.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO notificationPreferences (id, churchId, personId, allowPush, emailFrequency) VALUES (?, ?, ?, ?, ?);";
    const params = [notificationPreference.id, notificationPreference.churchId, notificationPreference.personId, notificationPreference.allowPush, notificationPreference.emailFrequency];
    await TypedDB.query(sql, params);
    return notificationPreference;
  }

  private async update(notificationPreference: NotificationPreference) {
    const sql = "UPDATE notificationPreferences SET personId=?, allowPush=?, emailFrequency=? WHERE id=? AND churchId=?;";
    const params = [notificationPreference.personId, notificationPreference.allowPush, notificationPreference.emailFrequency, notificationPreference.id, notificationPreference.churchId];
    await TypedDB.query(sql, params);
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

  public convertAllToModel(data: any) {
    return CollectionHelper.convertAll<NotificationPreference>(data, (d: any) => this.convertToModel(d));
  }

  public loadByPersonIds(personIds: string[]) {
    const sql = "SELECT * FROM notificationPreferences WHERE personId IN (?)";
    return TypedDB.query(sql, [personIds]);
  }
}
