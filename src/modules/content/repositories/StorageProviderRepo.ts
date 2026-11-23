import { injectable } from "inversify";
import type { StorageProviderRow } from "./types.js";
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
      enabled: model.enabled,
      accessToken: model.accessToken,
      refreshToken: model.refreshToken,
      tokenExpiresAt: model.tokenExpiresAt,
      settings: model.settings
    }).execute();
    return model;
  }

  private async update(model: StorageProvider): Promise<StorageProvider> {
    await getDb().updateTable("storageProviders").set({
      provider: model.provider,
      apiKey: model.apiKey,
      apiSecret: model.apiSecret,
      enabled: model.enabled,
      accessToken: model.accessToken,
      refreshToken: model.refreshToken,
      tokenExpiresAt: model.tokenExpiresAt,
      settings: model.settings
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

  protected rowToModel(data: StorageProviderRow): StorageProvider {
    return {
      id: data.id,
      churchId: data.churchId,
      provider: data.provider,
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      enabled: data.enabled === true || data.enabled === 1 || (data.enabled as Buffer)?.[0] === 1,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tokenExpiresAt: data.tokenExpiresAt,
      settings: data.settings
    };
  }

  public convertToModel(data: StorageProviderRow) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: StorageProviderRow[]) {
    return data.map((d) => this.rowToModel(d));
  }
}
