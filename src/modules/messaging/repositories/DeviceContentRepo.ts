import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { DeviceContent } from "../models/index.js";

@injectable()
export class DeviceContentRepo {
  public async save(model: DeviceContent) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: DeviceContent): Promise<DeviceContent> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("deviceContent").values({
      id: model.id,
      churchId: model.churchId,
      deviceId: model.deviceId,
      contentType: model.contentType,
      contentId: model.contentId
    }).execute();
    return model;
  }

  private async update(model: DeviceContent): Promise<DeviceContent> {
    await getDb().updateTable("deviceContent").set({
      deviceId: model.deviceId,
      contentType: model.contentType,
      contentId: model.contentId
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadByDeviceId(churchId: string, deviceId: string) {
    return getDb().selectFrom("deviceContent").selectAll()
      .where("churchId", "=", churchId)
      .where("deviceId", "=", deviceId)
      .execute();
  }

  public async deleteByDeviceId(churchId: string, deviceId: string) {
    await getDb().deleteFrom("deviceContent")
      .where("deviceId", "=", deviceId)
      .where("churchId", "=", churchId)
      .execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("deviceContent").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("deviceContent").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("deviceContent").selectAll().where("churchId", "=", churchId).execute();
  }

  protected rowToModel(row: any): DeviceContent {
    return {
      id: row.id,
      churchId: row.churchId,
      deviceId: row.deviceId,
      contentType: row.contentType,
      contentId: row.contentId
    };
  }
}
