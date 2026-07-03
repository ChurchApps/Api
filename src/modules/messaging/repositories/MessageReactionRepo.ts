import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { MessageReaction } from "../models/index.js";

@injectable()
export class MessageReactionRepo {
  public async loadOne(churchId: string, messageId: string, personId: string, emoji: string): Promise<MessageReaction | null> {
    return (await getDb().selectFrom("messageReactions").selectAll()
      .where("churchId", "=", churchId)
      .where("messageId", "=", messageId)
      .where("personId", "=", personId)
      .where("emoji", "=", emoji)
      .executeTakeFirst()) ?? null;
  }

  public async create(model: MessageReaction): Promise<MessageReaction> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("messageReactions").values({
      id: model.id,
      churchId: model.churchId,
      messageId: model.messageId,
      conversationId: model.conversationId,
      personId: model.personId,
      emoji: model.emoji,
      timeAdded: sql`NOW()`
    }).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("messageReactions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async loadForMessages(churchId: string, messageIds: string[]) {
    if (!messageIds || messageIds.length === 0) return [];
    return getDb().selectFrom("messageReactions")
      .select(["id", "messageId", "personId", "emoji"])
      .where("churchId", "=", churchId)
      .where("messageId", "in", messageIds)
      .execute();
  }

  public convertToModel(data: any) { return data as MessageReaction; }
  public convertAllToModel(data: any[]) { return (data || []) as MessageReaction[]; }
}
