import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Device } from "../models/index.js";

export class DeviceRepo {
  public async save(model: Device) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Device): Promise<Device> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("devices").values({
      id: model.id,
      churchId: model.churchId,
      appName: model.appName,
      deviceId: model.deviceId,
      personId: model.personId,
      fcmToken: model.fcmToken,
      label: model.label,
      registrationDate: model.registrationDate,
      lastActiveDate: model.lastActiveDate,
      deviceInfo: model.deviceInfo,
      admId: model.admId,
      pairingCode: model.pairingCode,
      ipAddress: model.ipAddress,
      contentType: model.contentType,
      contentId: model.contentId
    } as any).execute();
    return model;
  }

  private async update(model: Device): Promise<Device> {
    await getDb().updateTable("devices").set({
      appName: model.appName,
      deviceId: model.deviceId,
      churchId: model.churchId,
      personId: model.personId,
      fcmToken: model.fcmToken,
      label: model.label,
      lastActiveDate: model.lastActiveDate,
      deviceInfo: model.deviceInfo,
      admId: model.admId,
      pairingCode: model.pairingCode,
      ipAddress: model.ipAddress,
      contentType: model.contentType,
      contentId: model.contentId
    }).where("id", "=", model.id).execute();
    return model;
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (!ids || ids.length === 0) return [];
    return getDb().selectFrom("devices").selectAll()
      .where("churchId", "=", churchId)
      .where("id", "in", ids)
      .execute();
  }

  public async loadByPersonId(churchId: string, personId: string) {
    return getDb().selectFrom("devices").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .execute();
  }

  public async loadById(churchId: string, id: string): Promise<Device | undefined> {
    return (await getDb().selectFrom("devices").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByPairingCode(pairingCode: string): Promise<Device | undefined> {
    return (await getDb().selectFrom("devices").selectAll()
      .where("pairingCode", "=", pairingCode).executeTakeFirst()) ?? null;
  }

  public async loadByDeviceId(deviceId: string): Promise<Device | undefined> {
    return (await getDb().selectFrom("devices").selectAll()
      .where("deviceId", "=", deviceId).executeTakeFirst()) ?? null;
  }

  public async loadByFcmToken(churchId: string, fcmToken: string): Promise<Device | undefined> {
    return (await getDb().selectFrom("devices").selectAll()
      .where("fcmToken", "=", fcmToken).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByChurchId(churchId: string) {
    return getDb().selectFrom("devices").selectAll()
      .where("churchId", "=", churchId)
      .orderBy("lastActiveDate", "desc")
      .execute();
  }

  public async loadForPerson(churchId: string, personId: string) {
    return getDb().selectFrom("devices").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .execute();
  }

  public async deleteByFcmToken(fcmToken: string) {
    await getDb().deleteFrom("devices").where("fcmToken", "=", fcmToken).execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("devices").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public convertToModel(_churchId: string, data: any): Device {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]): Device[] {
    if (!data) return [];
    return (Array.isArray(data) ? data : []).map((d: any) => this.rowToModel(d));
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
