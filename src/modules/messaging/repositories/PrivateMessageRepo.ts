import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { PrivateMessage } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
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

  public async loadByPersonId(churchId: string, personId: string) {
    const result = await TypedDB.query("SELECT c.*, pm.id as pmId, pm.fromPersonId, pm.toPersonId, pm.notifyPersonId, pm.deliveryMethod, m.timeSent as lastMessageTime FROM privateMessages pm INNER JOIN conversations c on c.id=pm.conversationId LEFT JOIN messages m on m.id=c.lastPostId WHERE pm.churchId=? AND (pm.fromPersonId=? OR pm.toPersonId=?) ORDER BY COALESCE(m.timeSent, c.dateCreated) DESC", [churchId, personId, personId] );
    return this.mapToModels(result);
  }

  public loadByChurchId(churchId: string) {
    return TypedDB.query("SELECT * FROM privateMessages WHERE churchId=?", [churchId]);
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM privateMessages WHERE id=? AND churchId=?;", [id, churchId]);
  }

  protected rowToModel(data: any): PrivateMessage {
    const result: PrivateMessage = {
      id: data.pmId || data.id,
      churchId: data.churchId,
      fromPersonId: data.fromPersonId,
      toPersonId: data.toPersonId,
      conversationId: data.pmId ? data.id : data.conversationId,
      notifyPersonId: data.notifyPersonId,
      deliveryMethod: data.deliveryMethod,

      conversation: {
        id: data.id,
        churchId: data.churchId,
        contentType: data.contentType,
        contentId: data.contentId,
        title: data.title,
        dateCreated: data.dateCreated,
        groupId: data.groupId,
        visibility: data.visibility,
        firstPostId: data.firstPostId,
        lastPostId: data.lastPostId,
        postCount: data.postCount,
        allowAnonymousPosts: data.allowAnonymousPosts
      }
    };

    return result;
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

  public async loadUndelivered() {
    const sql = "SELECT * FROM privateMessages WHERE notifyPersonId IS NOT NULL AND (deliveryMethod IS NULL OR deliveryMethod='' OR deliveryMethod='push' OR deliveryMethod='socket' OR deliveryMethod='email')";
    const result = await TypedDB.query(sql, []);
    return this.mapToModels(result);
  }

  public async markAllRead(churchId: string, personId: string) {
    const sql = "UPDATE privateMessages SET notifyPersonId=NULL, deliveryMethod='complete' WHERE churchId=? AND notifyPersonId=?";
    return TypedDB.query(sql, [churchId, personId]);
  }

  public loadPendingEscalation() {
    const sql = "SELECT * FROM privateMessages WHERE notifyPersonId IS NOT NULL AND deliveryMethod IN ('socket', 'push')";
    return TypedDB.query(sql, []);
  }
}
