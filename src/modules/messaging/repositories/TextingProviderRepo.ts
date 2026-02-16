import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { TextingProvider } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { injectable } from "inversify";

@injectable()
export class TextingProviderRepo extends ConfiguredRepo<TextingProvider> {
  protected get repoConfig(): RepoConfig<TextingProvider> {
    return {
      tableName: "textingProviders",
      hasSoftDelete: false,
      insertColumns: ["provider", "apiKey", "apiSecret", "fromNumber", "enabled"],
      updateColumns: ["provider", "apiKey", "apiSecret", "fromNumber", "enabled"]
    };
  }

  public loadByChurchId(churchId: string) {
    return TypedDB.query("SELECT * FROM textingProviders WHERE churchId=?;", [churchId]);
  }

  public loadById(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM textingProviders WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM textingProviders WHERE id=? AND churchId=?;", [id, churchId]);
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

  public convertAllToModel(data: any) {
    return this.mapToModels(data);
  }
}
