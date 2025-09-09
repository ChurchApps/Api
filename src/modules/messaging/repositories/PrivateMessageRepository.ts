import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { PrivateMessage } from "../models";

export class PrivateMessageRepository {
  public loadById(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM privateMessages WHERE id=? and churchId=?;", [id, churchId]);
  }

  public loadByPersonId(churchId: string, personId: string) {
    return DB.query(
      "SELECT pm.*, c.title FROM privateMessages pm INNER JOIN conversations c on c.id=pm.conversationId WHERE pm.churchId=? AND (pm.fromPersonId=? OR pm.toPersonId=?) ORDER BY c.dateCreated DESC",
      [churchId, personId, personId]
    );
  }

  public loadByChurchId(churchId: string) {
    return DB.query("SELECT * FROM privateMessages WHERE churchId=?", [churchId]);
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM privateMessages WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public save(privateMessage: PrivateMessage) {
    return privateMessage.id ? this.update(privateMessage) : this.create(privateMessage);
  }

  private async create(privateMessage: PrivateMessage): Promise<PrivateMessage> {
    privateMessage.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO privateMessages (id, churchId, fromPersonId, toPersonId, conversationId, notifyPersonId, deliveryMethod) VALUES (?, ?, ?, ?, ?, ?, ?);";
    const params = [
      privateMessage.id,
      privateMessage.churchId,
      privateMessage.fromPersonId,
      privateMessage.toPersonId,
      privateMessage.conversationId,
      privateMessage.notifyPersonId,
      privateMessage.deliveryMethod
    ];
    await DB.query(sql, params);
    return privateMessage;
  }

  private async update(privateMessage: PrivateMessage) {
    const sql = "UPDATE privateMessages SET fromPersonId=?, toPersonId=?, conversationId=?, notifyPersonId=?, deliveryMethod=? WHERE id=? AND churchId=?;";
    const params = [
      privateMessage.fromPersonId,
      privateMessage.toPersonId,
      privateMessage.conversationId,
      privateMessage.notifyPersonId,
      privateMessage.deliveryMethod,
      privateMessage.id,
      privateMessage.churchId
    ];
    await DB.query(sql, params);
    return privateMessage;
  }

  public convertToModel(data: any) {
    const result: PrivateMessage = {
      id: data.id,
      churchId: data.churchId,
      fromPersonId: data.fromPersonId,
      toPersonId: data.toPersonId,
      conversationId: data.conversationId,
      notifyPersonId: data.notifyPersonId,
      deliveryMethod: data.deliveryMethod
    };
    return result;
  }

  public convertAllToModel(data: any[]) {
    const result: PrivateMessage[] = [];
    data.forEach((d) => result.push(this.convertToModel(d)));
    return result;
  }

  public loadByConversationId(churchId: string, conversationId: string) {
    return DB.queryOne("SELECT * FROM privateMessages WHERE churchId=? AND conversationId=?", [churchId, conversationId]);
  }

  public loadUndelivered() {
    const sql = "SELECT * FROM privateMessages WHERE deliveryMethod IS NULL OR deliveryMethod=''";
    return DB.query(sql, []);
  }
}
