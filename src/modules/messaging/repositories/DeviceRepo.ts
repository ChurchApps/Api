import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Device } from "../models";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

export class DeviceRepo extends ConfiguredRepo<Device> {
  protected get repoConfig(): RepoConfig<Device> {
    return {
      tableName: "devices",
      hasSoftDelete: false,
      insertColumns: ["appName", "deviceId", "personId", "fcmToken", "label", "registrationDate", "lastActiveDate", "deviceInfo", "admId", "pairingCode", "ipAddress", "contentType", "contentId"],
      updateColumns: ["appName", "deviceId", "personId", "fcmToken", "label", "lastActiveDate", "deviceInfo", "admId", "pairingCode", "ipAddress", "contentType", "contentId"]
    };
  }

  public loadByIds(churchId: string, ids: string[]) {
    return TypedDB.query("SELECT * FROM devices WHERE churchId=? AND id IN (?)", [churchId, ids]);
  }

  public loadByPersonId(churchId: string, personId: string) {
    return TypedDB.query("SELECT * FROM devices WHERE churchId=? AND personId=?", [churchId, personId]);
  }

  public loadById(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM devices WHERE id=? and churchId=?;", [id, churchId]);
  }

  public async loadByPairingCode(pairingCode: string) {
    return TypedDB.queryOne("SELECT * FROM devices WHERE pairingCode=?;", [pairingCode]);
  }

  public loadByDeviceId(deviceId: string) {
    return TypedDB.queryOne("SELECT * FROM devices WHERE deviceId=?;", [deviceId]);
  }

  public loadByFcmToken(churchId: string, fcmToken: string) {
    return TypedDB.queryOne("SELECT * FROM devices WHERE fcmToken=? and churchId=?;", [fcmToken, churchId]);
  }

  public loadByChurchId(churchId: string) {
    return TypedDB.query("SELECT * FROM devices WHERE churchId=? ORDER BY lastActiveDate desc", [churchId]);
  }

  public loadForPerson(churchId: string, personId: string) {
    return TypedDB.query("SELECT * FROM devices WHERE churchId=? AND personId=?", [churchId, personId]);
  }

  public deleteByFcmToken(fcmToken: string) {
    return TypedDB.query("DELETE FROM devices WHERE fcmToken=?", [fcmToken]);
  }

  protected rowToModel(row: any): Device {
    return {
      id: row.id,
      appName: row.appName,
      deviceId: row.deviceId,
      churchId: row.churchId,
      personId: row.personId,
      fcmToken: row.fcmToken,
      label: row.label,
      registrationDate: row.registrationDate,
      lastActiveDate: row.lastActiveDate,
      deviceInfo: row.deviceInfo,
      admId: row.admId,
      pairingCode: row.pairingCode,
      ipAddress: row.ipAddress,
      contentType: row.contentType,
      contentId: row.contentId
    };
  }
}
