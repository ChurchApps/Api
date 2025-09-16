import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { PrivateMessage } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";
import { injectable } from "inversify";

@injectable()
export class PrivateMessageRepo extends ConfiguredRepo<PrivateMessage> {
  protected get repoConfig(): RepoConfig<PrivateMessage> {
    return {
      tableName: "privateMessages",
      hasSoftDelete: false,
      columns: ["fromPersonId", "toPersonId", "conversationId", "notifyPersonId", "deliveryMethod"]
    };
  }
  public loadById(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM privateMessages WHERE id=? and churchId=?;", [id, churchId]);
  }

  public loadByPersonId(churchId: string, personId: string) {
    return TypedDB.query(
      "SELECT pm.*, c.title FROM privateMessages pm INNER JOIN conversations c on c.id=pm.conversationId WHERE pm.churchId=? AND (pm.fromPersonId=? OR pm.toPersonId=?) ORDER BY c.dateCreated DESC",
      [churchId, personId, personId]
    );
  }

  public loadByChurchId(churchId: string) {
    return TypedDB.query("SELECT * FROM privateMessages WHERE churchId=?", [churchId]);
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM privateMessages WHERE id=? AND churchId=?;", [id, churchId]);
  }

  protected rowToModel(data: any): PrivateMessage {
    return {
      id: data.id,
      churchId: data.churchId,
      fromPersonId: data.fromPersonId,
      toPersonId: data.toPersonId,
      conversationId: data.conversationId,
      notifyPersonId: data.notifyPersonId,
      deliveryMethod: data.deliveryMethod
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any) {
    return this.mapToModels(data);
  }

  public loadByConversationId(churchId: string, conversationId: string) {
    return TypedDB.queryOne("SELECT * FROM privateMessages WHERE churchId=? AND conversationId=?", [churchId, conversationId]);
  }

  public loadUndelivered() {
    const sql = "SELECT * FROM privateMessages WHERE deliveryMethod IS NULL OR deliveryMethod=''";
    return TypedDB.query(sql, []);
  }
}
