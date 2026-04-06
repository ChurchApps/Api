import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Conversation } from "../models/index.js";

@injectable()
export class ConversationRepo {
  public async save(conversation: Conversation) {
    await this.cleanup();
    return conversation.id ? this.update(conversation) : this.create(conversation);
  }

  private async create(model: Conversation): Promise<Conversation> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("conversations").values({
      id: model.id,
      churchId: model.churchId,
      contentType: model.contentType,
      contentId: model.contentId,
      title: model.title,
      groupId: model.groupId,
      visibility: model.visibility,
      allowAnonymousPosts: model.allowAnonymousPosts,
      dateCreated: sql`NOW()`,
      postCount: 0
    }).execute();
    return model;
  }

  private async update(model: Conversation): Promise<Conversation> {
    await getDb().updateTable("conversations").set({
      title: model.title,
      groupId: model.groupId,
      visibility: model.visibility,
      allowAnonymousPosts: model.allowAnonymousPosts
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  private async cleanup() {
    await sql`CALL cleanup()`.execute(getDb());
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (!ids || ids.length === 0) return [];
    return getDb().selectFrom("conversations")
      .select(["id", "firstPostId", "lastPostId", "postCount"])
      .where("churchId", "=", churchId)
      .where("id", "in", ids)
      .execute();
  }

  public async loadPosts(churchId: string, groupIds: string[]) {
    if (!groupIds || groupIds.length === 0) return [];
    return getDb().selectFrom("conversations as c")
      .innerJoin("messages as fp", "fp.id", "c.firstPostId")
      .innerJoin("messages as lp", "lp.id", "c.lastPostId")
      .select(["c.contentType", "c.contentId", "c.groupId", "c.id", "c.firstPostId", "c.lastPostId", "c.postCount"])
      .where("c.churchId", "=", churchId)
      .where("c.groupId", "in", groupIds)
      .where("lp.timeSent", ">", sql`DATE_SUB(NOW(), INTERVAL 365 DAY)` as any)
      .execute();
  }

  public async loadById(churchId: string, id: string) {
    return (await getDb().selectFrom("conversations").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForContent(churchId: string, contentType: string, contentId: string) {
    return getDb().selectFrom("conversations").selectAll()
      .where("churchId", "=", churchId)
      .where("contentType", "=", contentType)
      .where("contentId", "=", contentId)
      .orderBy("dateCreated", "desc")
      .execute();
  }

  public async loadCurrent(churchId: string, contentType: string, contentId: string) {
    const cutOff = new Date();
    cutOff.setDate(cutOff.getDate() - 1);
    return (await getDb().selectFrom("conversations").selectAll()
      .where("churchId", "=", churchId)
      .where("contentType", "=", contentType)
      .where("contentId", "=", contentId)
      .where("dateCreated", ">=", cutOff)
      .orderBy("dateCreated", "desc")
      .limit(1)
      .executeTakeFirst()) ?? null;
  }

  public async loadHostConversation(churchId: string, mainConversationId: string) {
    const result = await getDb().selectFrom("conversations as c")
      .innerJoin("conversations as c2", (join) =>
        join.onRef("c2.churchId", "=", "c.churchId")
          .on("c2.contentType", "=", "streamingLiveHost")
          .onRef("c2.contentId", "=", "c.contentId")
      )
      .selectAll("c2")
      .where("c.id", "=", mainConversationId)
      .where("c.churchId", "=", churchId)
      .limit(1)
      .executeTakeFirst();
    return result;
  }

  public async updateStats(conversationId: string) {
    await sql`CALL updateConversationStats(${conversationId})`.execute(getDb());
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("conversations").where("id", "=", id).where("churchId", "=", churchId).execute();
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

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
