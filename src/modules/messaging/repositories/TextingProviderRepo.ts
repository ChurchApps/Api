import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { TextingProvider } from "../models/index.js";

@injectable()
export class TextingProviderRepo {
  public async save(model: TextingProvider) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: TextingProvider): Promise<TextingProvider> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("textingProviders").values({
      id: model.id,
      churchId: model.churchId,
      provider: model.provider,
      apiKey: model.apiKey,
      apiSecret: model.apiSecret,
      fromNumber: model.fromNumber,
      enabled: model.enabled
    }).execute();
    return model;
  }

  private async update(model: TextingProvider): Promise<TextingProvider> {
    await getDb().updateTable("textingProviders").set({
      provider: model.provider,
      apiKey: model.apiKey,
      apiSecret: model.apiSecret,
      fromNumber: model.fromNumber,
      enabled: model.enabled
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadByChurchId(churchId: string) {
    return getDb().selectFrom("textingProviders").selectAll()
      .where("churchId", "=", churchId)
      .execute();
  }

  public async loadById(churchId: string, id: string) {
    return (await getDb().selectFrom("textingProviders").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("textingProviders").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  protected rowToModel(data: any): TextingProvider {
    return {
      id: data.id,
      churchId: data.churchId,
      provider: data.provider,
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      fromNumber: data.fromNumber,
      enabled: data.enabled
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
