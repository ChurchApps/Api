import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Setting } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { UniqueIdHelper } from "@churchapps/apihelper";

@injectable()
export class SettingRepository {
  public save(setting: Setting) {
    return setting.id ? this.update(setting) : this.create(setting);
  }

  private async create(setting: Setting) {
    setting.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO settings (id, churchId, keyName, value, public) VALUES (?, ?, ?, ?, ?)";
    const params = [setting.id, setting.churchId, setting.keyName, setting.value, setting.public];
    await TypedDB.query(sql, params);
    return setting;
  }

  private async update(setting: Setting) {
    const sql = "UPDATE settings SET churchId=?, keyName=?, value=?, public=? WHERE id=? AND churchId=?";
    const params = [setting.churchId, setting.keyName, setting.value, setting.public, setting.id, setting.churchId];
    await TypedDB.query(sql, params);
    return setting;
  }

  public loadAll(churchId: string) {
    return TypedDB.query("SELECT * FROM settings WHERE churchId=?;", [churchId]);
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

  public convertToModel(churchId: string, data: any) {
    const result: Setting = {
      id: data.id,
      keyName: data.keyName,
      value: data.value,
      public: data.public
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<Setting>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
