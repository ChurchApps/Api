import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { deviceContents } from "../../../db/schema/messaging.js";

@injectable()
export class DeviceContentRepo extends DrizzleRepo<typeof deviceContents> {
  protected readonly table = deviceContents;
  protected readonly moduleName = "messaging";

  public async loadByDeviceId(churchId: string, deviceId: string) {
    const result = await this.db.select().from(deviceContents)
      .where(and(eq(deviceContents.churchId, churchId), eq(deviceContents.deviceId, deviceId)));
    return result || [];
  }

  public async deleteByDeviceId(churchId: string, deviceId: string) {
    await this.db.delete(deviceContents)
      .where(and(eq(deviceContents.deviceId, deviceId), eq(deviceContents.churchId, churchId)));
  }
}
