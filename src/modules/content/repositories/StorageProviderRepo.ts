import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { StorageProvider } from "../models/index.js";

@injectable()
export class StorageProviderRepo {
  public async save(model: StorageProvider) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: StorageProvider): Promise<StorageProvider> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("storageProviders").values({
      id: model.id,
      churchId: model.churchId,
      provider: model.provider,
      apiKey: model.apiKey,
      apiSecret: model.apiSecret,
      enabled: model.enabled
    }).execute();
    return model;
  }

  private async update(model: StorageProvider): Promise<StorageProvider> {
    await getDb().updateTable("storageProviders").set({
      provider: model.provider,
      apiKey: model.apiKey,
      apiSecret: model.apiSecret,
      enabled: model.enabled
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadByChurchId(churchId: string) {
    return getDb().selectFrom("storageProviders").selectAll()
      .where("churchId", "=", churchId)
      .execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("storageProviders").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  protected rowToModel(data: any): StorageProvider {
    return {
      id: data.id,
      churchId: data.churchId,
      provider: data.provider,
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      enabled: data.enabled === true || data.enabled === 1 || data.enabled?.[0] === 1
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
