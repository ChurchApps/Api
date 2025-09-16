import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Conversation } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";
import { injectable } from "inversify";

@injectable()
export class ConversationRepository extends ConfiguredRepository<Conversation> {
  protected get repoConfig(): RepoConfig<Conversation> {
    return {
      tableName: "conversations",
      hasSoftDelete: false,
      insertColumns: ["contentType", "contentId", "title", "groupId", "visibility", "allowAnonymousPosts"],
      updateColumns: ["title", "groupId", "visibility", "allowAnonymousPosts"],
      insertLiterals: { dateCreated: "NOW()", postCount: "0" }
    };
  }

  // Override save to include cleanup
  public async save(conversation: Conversation) {
    await this.cleanup();
    return super.save(conversation);
  }

  private cleanup() {
    return TypedDB.query("CALL cleanup()", []);
  }

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

  public loadById(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM conversations WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadForContent(churchId: string, contentType: string, contentId: string) {
    return TypedDB.query("SELECT * FROM conversations WHERE churchId=? AND contentType=? AND contentId=? ORDER BY dateCreated DESC", [churchId, contentType, contentId]);
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

  public async updateStats(conversationId: string) {
    const sql = "CALL updateConversationStats(?)";
    const params = [conversationId];
    await TypedDB.query(sql, params);
  }

  protected rowToModel(data: any): Conversation {
    return {
      id: data.id,
      churchId: data.churchId,
      contentType: data.contentType,
      contentId: data.contentId,
      title: data.title,
      dateCreated: data.dateCreated
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any) {
    return this.mapToModels(data);
  }
}
