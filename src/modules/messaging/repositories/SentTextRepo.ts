import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { SentText } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { injectable } from "inversify";

@injectable()
export class SentTextRepo extends ConfiguredRepo<SentText> {
  protected get repoConfig(): RepoConfig<SentText> {
    return {
      tableName: "sentTexts",
      hasSoftDelete: false,
      insertColumns: ["groupId", "recipientPersonId", "senderPersonId", "message", "recipientCount", "successCount", "failCount"],
      updateColumns: ["recipientCount", "successCount", "failCount"],
      insertLiterals: { timeSent: "NOW()" }
    };
  }

  public loadByChurchId(churchId: string) {
    return TypedDB.query("SELECT * FROM sentTexts WHERE churchId=? ORDER BY timeSent DESC;", [churchId]);
  }

  public loadById(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM sentTexts WHERE id=? AND churchId=?;", [id, churchId]);
  }

  protected rowToModel(data: any): SentText {
    return {
      id: data.id,
      churchId: data.churchId,
      groupId: data.groupId,
      recipientPersonId: data.recipientPersonId,
      senderPersonId: data.senderPersonId,
      message: data.message,
      recipientCount: data.recipientCount,
      successCount: data.successCount,
      failCount: data.failCount,
      timeSent: data.timeSent
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any) {
    return this.mapToModels(data);
  }
}
