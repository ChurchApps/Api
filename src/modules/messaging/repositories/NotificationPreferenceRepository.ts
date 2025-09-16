import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { NotificationPreference } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";
import { injectable } from "inversify";

@injectable()
export class NotificationPreferenceRepository extends ConfiguredRepository<NotificationPreference> {
  protected get repoConfig(): RepoConfig<NotificationPreference> {
    return {
      tableName: "notificationPreferences",
      hasSoftDelete: false,
      insertColumns: ["personId", "allowPush", "emailFrequency"],
      updateColumns: ["personId", "allowPush", "emailFrequency"]
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
