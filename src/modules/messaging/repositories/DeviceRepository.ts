import { DB } from "../../../shared/infrastructure";
import { Device } from "../models";
import { CollectionHelper } from "../../../shared/helpers";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

export class DeviceRepository extends ConfiguredRepository<Device> {
  protected get repoConfig(): RepoConfig<Device> {
    return {
      tableName: "devices",
      hasSoftDelete: false,
      insertColumns: ["appName", "deviceId", "personId", "fcmToken", "label", "registrationDate", "lastActiveDate", "deviceInfo", "admId", "pairingCode", "ipAddress"],
      updateColumns: ["appName", "deviceId", "personId", "fcmToken", "label", "lastActiveDate", "deviceInfo", "admId", "pairingCode", "ipAddress"]
    };
  }

  public loadByIds(churchId: string, ids: string[]) {
    return DB.query("SELECT * FROM devices WHERE churchId=? AND id IN (?)", [churchId, ids]);
  }

  public loadByPersonId(churchId: string, personId: string) {
    return DB.query("SELECT * FROM devices WHERE churchId=? AND personId=?", [churchId, personId]);
  }

  public loadById(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM devices WHERE id=? and churchId=?;", [id, churchId]);
  }

  public loadByDeviceId(churchId: string, deviceId: string) {
    return DB.queryOne("SELECT * FROM devices WHERE deviceId=? and churchId=?;", [deviceId, churchId]);
  }

  public loadByFcmToken(churchId: string, fcmToken: string) {
    return DB.queryOne("SELECT * FROM devices WHERE fcmToken=? and churchId=?;", [fcmToken, churchId]);
  }

  public loadByChurchId(churchId: string) {
    return DB.query("SELECT * FROM devices WHERE churchId=? ORDER BY lastActiveDate desc", [churchId]);
  }

  public convertToModel(data: any) {
    const result: Device = {
      id: data.id,
      appName: data.appName,
      deviceId: data.deviceId,
      churchId: data.churchId,
      personId: data.personId,
      fcmToken: data.fcmToken,
      label: data.label,
      registrationDate: data.registrationDate,
      lastActiveDate: data.lastActiveDate,
      deviceInfo: data.deviceInfo,
      admId: data.admId,
      pairingCode: data.pairingCode,
      ipAddress: data.ipAddress
    };
    return result;
  }

  public convertAllToModel(data: any) {
    return CollectionHelper.convertAll<Device>(data, (d: any) => this.convertToModel(d));
  }

  public loadForPerson(churchId: string, personId: string) {
    return DB.query("SELECT * FROM devices WHERE churchId=? AND personId=?", [churchId, personId]);
  }
}
