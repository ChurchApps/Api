import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Message } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";
import { injectable } from "inversify";

@injectable()
export class MessageRepo extends ConfiguredRepo<Message> {
  protected get repoConfig(): RepoConfig<Message> {
    return {
      tableName: "messages",
      hasSoftDelete: false,
      insertColumns: ["conversationId", "personId", "displayName", "messageType", "content"],
      updateColumns: ["personId", "displayName", "content", "timeUpdated"],
      insertLiterals: { timeSent: "NOW()" }
    };
  }
  public async loadById(churchId: string, id: string) {
    const result: any = await TypedDB.queryOne("SELECT * FROM messages WHERE id=? AND churchId=?;", [id, churchId]);
    return result || {};
  }

  public async loadByIds(churchId: string, ids: string[]) {
    const result: any = await TypedDB.query("SELECT * FROM messages WHERE id IN (?) AND churchId=?;", [ids, churchId]);
    return result || [];
  }

  public async loadForConversation(churchId: string, conversationId: string) {
    const result: any = await TypedDB.query("SELECT * FROM messages WHERE churchId=? AND conversationId=? ORDER BY timeSent", [churchId, conversationId]);
    return result || [];
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM messages WHERE id=? AND churchId=?;", [id, churchId]);
  }

  protected rowToModel(data: any): Message {
    return {
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
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any) {
    return this.mapToModels(data);
  }
}
