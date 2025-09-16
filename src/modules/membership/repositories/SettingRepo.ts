import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Setting } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class SettingRepo extends ConfiguredRepo<Setting> {
  protected get repoConfig(): RepoConfig<Setting> {
    return {
      tableName: "settings",
      hasSoftDelete: false,
      columns: ["keyName", "value", "public"]
    };
  }

  public loadPublicSettings(churchId: string) {
    console.log("SELECT * FROM settings WHERE churchId=? AND public=?", [churchId, 1]);
    return TypedDB.query("SELECT * FROM settings WHERE churchId=? AND public=?", [churchId, 1]);
  }

  public loadMulipleChurches(keyNames: string[], churchIds: string[]) {
    if (!keyNames.length || !churchIds.length) return Promise.resolve([]);

    const keyNamePlaceholders = keyNames.map(() => "?").join(",");
    const churchIdPlaceholders = churchIds.map(() => "?").join(",");

    const sql = `SELECT * FROM settings WHERE keyName IN (${keyNamePlaceholders}) AND churchId IN (${churchIdPlaceholders}) AND public=1`;
    const params = [...keyNames, ...churchIds];

    return TypedDB.query(sql, params);
  }

  protected rowToModel(row: any): Setting {
    return {
      id: row.id,
      churchId: row.churchId,
      keyName: row.keyName,
      value: row.value,
      public: row.public
    };
  }
}
