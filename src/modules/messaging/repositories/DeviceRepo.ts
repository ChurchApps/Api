import { injectable } from "inversify";
import { eq, and, inArray, desc } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { devices } from "../../../db/schema/messaging.js";

@injectable()
export class DeviceRepo extends DrizzleRepo<typeof devices> {
  protected readonly table = devices;
  protected readonly moduleName = "messaging";

  public async save(model: any) {
    if (model.id) {
      const { id: _id, ...setData } = model;
      await this.db.update(devices).set(setData).where(eq(devices.id, model.id));
    } else {
      model.id = UniqueIdHelper.shortId();
      await this.db.insert(devices).values(model);
    }
    return model;
  }

  public async delete(churchId: string, id: string) {
    await this.db.delete(devices).where(eq(devices.id, id));
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (!ids || ids.length === 0) return [];
    const result = await this.db.select().from(devices)
      .where(and(eq(devices.churchId, churchId), inArray(devices.id, ids)));
    return result || [];
  }

  public async loadByPersonId(churchId: string, personId: string) {
    const result = await this.db.select().from(devices)
      .where(and(eq(devices.churchId, churchId), eq(devices.personId, personId)));
    return result || [];
  }

  public async loadById(churchId: string, id: string) {
    return this.db.select().from(devices)
      .where(and(eq(devices.id, id), eq(devices.churchId, churchId)))
      .then(r => r[0] ?? null);
  }

  public async loadByPairingCode(pairingCode: string) {
    return this.db.select().from(devices)
      .where(eq(devices.pairingCode, pairingCode))
      .then(r => r[0] ?? null);
  }

  public async loadByDeviceId(deviceId: string): Promise<any> {
    return this.db.select().from(devices)
      .where(eq(devices.deviceId, deviceId))
      .then(r => r[0] ?? null);
  }

  public async loadByFcmToken(churchId: string, fcmToken: string) {
    return this.db.select().from(devices)
      .where(and(eq(devices.fcmToken, fcmToken), eq(devices.churchId, churchId)))
      .then(r => r[0] ?? null);
  }

  public async loadByChurchId(churchId: string) {
    const result = await this.db.select().from(devices)
      .where(eq(devices.churchId, churchId))
      .orderBy(desc(devices.lastActiveDate));
    return result || [];
  }

  public async loadForPerson(churchId: string, personId: string) {
    const result = await this.db.select().from(devices)
      .where(and(eq(devices.churchId, churchId), eq(devices.personId, personId)));
    return result || [];
  }

  public async deleteByFcmToken(fcmToken: string) {
    await this.db.delete(devices).where(eq(devices.fcmToken, fcmToken));
  }

}
