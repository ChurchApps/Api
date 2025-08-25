import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Message } from "../models";

export class MessageRepository {
  public async loadById(churchId: string, id: string) {
    const result: any = await DB.queryOne("SELECT * FROM messages WHERE id=? AND churchId=?;", [id, churchId]);
    return result.rows || result || {};
  }

  public async loadByIds(churchId: string, ids: string[]) {
    const result: any = await DB.query("SELECT * FROM messages WHERE id IN (?) AND churchId=?;", [ids, churchId]);
    return result.rows || result || [];
  }

  public async loadForConversation(churchId: string, conversationId: string) {
    const result: any = await DB.query("SELECT * FROM messages WHERE churchId=? AND conversationId=? ORDER BY timeSent", [churchId, conversationId]);
    return result.rows || result || [];
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM messages WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public save(message: Message) {
    return message.id ? this.update(message) : this.create(message);
  }

  private async create(message: Message) {
    message.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO messages (id, churchId, conversationId, personId, displayName, timeSent, messageType, content) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?);";
    const params = [message.id, message.churchId, message.conversationId, message.personId, message.displayName, message.messageType, message.content];
    await DB.query(sql, params);
    return message;
  }

  private async update(message: Message) {
    const sql = "UPDATE messages SET personId=?, displayName=?, content=?, timeUpdated=? WHERE id=? AND churchId=?;";
    const params = [message.personId, message.displayName, message.content, message.timeUpdated, message.id, message.churchId];
    await DB.query(sql, params);
    return message;
  }

  public convertToModel(data: any) {
    const result: Message = {
      id: data.id,
      churchId: data.churchId,
      conversationId: data.conversationId,
      displayName: data.displayName,
      timeSent: data.timeSent,
      messageType: data.messageType,
      content: data.content,
      personId: data.personId,
      timeUpdated: data.timeUpdated
    };
    return result;
  }

  public convertAllToModel(data: any[]) {
    const result: Message[] = [];
    if (data && Array.isArray(data)) {
      data.forEach((d) => result.push(this.convertToModel(d)));
    }
    return result;
  }
}
