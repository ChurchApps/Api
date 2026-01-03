import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { NotificationPreference } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { injectable } from "inversify";

@injectable()
export class NotificationPreferenceRepo extends ConfiguredRepo<NotificationPreference> {
  protected get repoConfig(): RepoConfig<NotificationPreference> {
    return {
      tableName: "notificationPreferences",
      hasSoftDelete: false,
      columns: ["personId", "allowPush", "emailFrequency"]
    };
  }
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

  protected rowToModel(data: any): NotificationPreference {
    return {
      id: data.id,
      churchId: data.churchId,
      personId: data.personId,
      allowPush: data.allowPush,
      emailFrequency: data.emailFrequency
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any) {
    return this.mapToModels(data);
  }

  public loadByPersonIds(personIds: string[]) {
    const sql = "SELECT * FROM notificationPreferences WHERE personId IN (?)";
    return TypedDB.query(sql, [personIds]);
  }
}
