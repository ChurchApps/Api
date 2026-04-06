import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Message } from "../models/index.js";

@injectable()
export class MessageRepo {
  public async save(model: Message) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Message): Promise<Message> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("messages").values({
      id: model.id,
      churchId: model.churchId,
      conversationId: model.conversationId,
      personId: model.personId,
      displayName: model.displayName,
      messageType: model.messageType,
      content: model.content,
      timeSent: sql`NOW()`
    }).execute();
    return model;
  }

  private async update(model: Message): Promise<Message> {
    await getDb().updateTable("messages").set({
      personId: model.personId,
      displayName: model.displayName,
      content: model.content,
      timeUpdated: model.timeUpdated
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadById(churchId: string, id: string): Promise<any> {
    const result = (await getDb().selectFrom("messages").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
    return result || {};
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (!ids || ids.length === 0) return [];
    return getDb().selectFrom("messages").selectAll()
      .where("id", "in", ids)
      .where("churchId", "=", churchId)
      .execute();
  }

  public async loadForConversation(churchId: string, conversationId: string) {
    return getDb().selectFrom("messages").selectAll()
      .where("churchId", "=", churchId)
      .where("conversationId", "=", conversationId)
      .orderBy("timeSent")
      .execute();
  }

  public async loadForConversationPaginated(
    churchId: string,
    conversationId: string,
    page: number = 1,
    limit: number = 20
  ) {
    const offset = (page - 1) * limit;
    return getDb().selectFrom("messages").selectAll()
      .where("churchId", "=", churchId)
      .where("conversationId", "=", conversationId)
      .orderBy("timeSent", "desc")
      .limit(limit)
      .offset(offset)
      .execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("messages").where("id", "=", id).where("churchId", "=", churchId).execute();
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

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
