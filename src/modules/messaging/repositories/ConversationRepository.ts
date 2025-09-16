import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Conversation } from "../models";
import { CollectionHelper } from "../../../shared/helpers";

export class ConversationRepository {
  public async loadByIds(churchId: string, ids: string[]) {
    const sql = "select id, firstPostId, lastPostId, postCount" + " FROM conversations" + " WHERE churchId=? and id IN (?)";
    const params = [churchId, ids];
    const result: any = await TypedDB.query(sql, params);
    return result || [];
  }

  public async loadPosts(churchId: string, groupIds: string[]) {
    const sql =
      "select c.contentType, c.contentId, c.groupId, c.id, c.firstPostId, c.lastPostId, c.postCount" +
      " FROM conversations c" +
      " INNER JOIN messages fp on fp.id=c.firstPostId" +
      " INNER JOIN messages lp on lp.id=c.lastPostId" +
      " WHERE c.churchId=? and c.groupId IN (?)" +
      " AND lp.timeSent>DATE_SUB(NOW(), INTERVAL 365 DAY)";
    const params = [churchId, groupIds];
    const result: any = await TypedDB.query(sql, params);
    return result || [];
  }

  private cleanup() {
    return TypedDB.query("CALL cleanup()", []);
  }

  public loadById(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM conversations WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadForContent(churchId: string, contentType: string, contentId: string) {
    return TypedDB.query("SELECT * FROM conversations WHERE churchId=? AND contentType=? AND contentId=? ORDER BY dateCreated DESC", [churchId, contentType, contentId]);
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM conversations WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async save(conversation: Conversation) {
    await this.cleanup();
    return conversation.id ? this.update(conversation) : this.create(conversation);
  }

  public loadCurrent(churchId: string, contentType: string, contentId: string) {
    const cutOff = new Date();
    cutOff.setDate(cutOff.getDate() - 1);
    const sql = "select *" + " FROM conversations" + " WHERE churchId=? and contentType=? AND contentId=? AND dateCreated>=? ORDER BY dateCreated desc LIMIT 1;";
    return TypedDB.queryOne(sql, [churchId, contentType, contentId, cutOff]);
  }

  public loadHostConversation(churchId: string, mainConversationId: string) {
    const sql =
      "select c2.*" +
      " FROM conversations c" +
      " INNER JOIN conversations c2 on c2.churchId=c.churchId and c2.contentType='streamingLiveHost' and c2.contentId=c.contentId" +
      " WHERE c.id=? AND c.churchId=? LIMIT 1;";
    return TypedDB.queryOne(sql, [mainConversationId, churchId]);
  }

  private async create(conversation: Conversation) {
    conversation.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO conversations (id, churchId, contentType, contentId, title, dateCreated, groupId, visibility, postCount, allowAnonymousPosts) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, 0, ?);";
    const params = [
      conversation.id,
      conversation.churchId,
      conversation.contentType,
      conversation.contentId,
      conversation.title,
      conversation.groupId,
      conversation.visibility,
      conversation.allowAnonymousPosts
    ];
    await TypedDB.query(sql, params);
    return conversation;
  }

  private async update(conversation: Conversation) {
    const sql = "UPDATE conversations SET title=?, groupId=?, visibility=?, allowAnonymousPosts=? WHERE id=? AND churchId=?;";
    const params = [conversation.title, conversation.groupId, conversation.visibility, conversation.allowAnonymousPosts, conversation.id, conversation.churchId];
    await TypedDB.query(sql, params);
    return conversation;
  }

  public async updateStats(conversationId: string) {
    const sql = "CALL updateConversationStats(?)";
    const params = [conversationId];
    await TypedDB.query(sql, params);
  }

  public convertToModel(data: any) {
    const result: Conversation = {
      id: data.id,
      churchId: data.churchId,
      contentType: data.contentType,
      contentId: data.contentId,
      title: data.title,
      dateCreated: data.dateCreated
    };
    return result;
  }

  public convertAllToModel(data: any) {
    return CollectionHelper.convertAll<Conversation>(data, (d: any) => this.convertToModel(d));
  }
}
