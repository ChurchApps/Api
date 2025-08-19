import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Device } from "../models";

export class DeviceRepository {
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

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM devices WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public save(device: Device) {
    return device.id ? this.update(device) : this.create(device);
  }

  private async create(device: Device): Promise<Device> {
    device.id = UniqueIdHelper.shortId();
    const sql =
      "INSERT INTO devices (id, appName, deviceId, churchId, personId, fcmToken, label, registrationDate, lastActiveDate, deviceInfo, admId, pairingCode, ipAddress) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      device.id,
      device.appName,
      device.deviceId,
      device.churchId,
      device.personId,
      device.fcmToken,
      device.label,
      device.registrationDate,
      device.lastActiveDate,
      device.deviceInfo,
      device.admId,
      device.pairingCode,
      device.ipAddress
    ];
    await DB.query(sql, params);
    return device;
  }

  private async update(device: Device) {
    const sql =
      "UPDATE devices SET appName=?, deviceId=?, personId=?, fcmToken=?, label=?, lastActiveDate=?, deviceInfo=?, admId=?, pairingCode=?, ipAddress=? WHERE id=? AND churchId=?;";
    const params = [
      device.appName,
      device.deviceId,
      device.personId,
      device.fcmToken,
      device.label,
      device.lastActiveDate,
      device.deviceInfo,
      device.admId,
      device.pairingCode,
      device.ipAddress,
      device.id,
      device.churchId
    ];
    await DB.query(sql, params);
    return device;
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

  public convertAllToModel(data: any[]) {
    const result: Device[] = [];
    data.forEach((d) => result.push(this.convertToModel(d)));
    return result;
  }

  public loadForPerson(churchId: string, personId: string) {
    return DB.query("SELECT * FROM devices WHERE churchId=? AND personId=?", [churchId, personId]);
  }
}
