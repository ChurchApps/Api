import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Message } from "../models/index.js";
import { retryOnDeadlock } from "../../../shared/helpers/retryOnDeadlock.js";

@injectable()
export class MessageRepo {
  public async save(model: Message) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Message): Promise<Message> {
    model.id = UniqueIdHelper.shortId();
    await retryOnDeadlock(() => getDb().insertInto("messages").values({
      id: model.id,
      churchId: model.churchId,
      conversationId: model.conversationId,
      personId: model.personId,
      displayName: model.displayName,
      messageType: model.messageType,
      content: model.content,
      timeSent: sql`NOW()`
    }).execute());
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

  public async loadLatestPerPerson(churchId: string, conversationId: string): Promise<Message[]> {
    const result = await sql<any>`
      SELECT m.personId, m.messageType, m.content, m.timeSent
      FROM messages m
      INNER JOIN (
        SELECT personId, MAX(timeSent) AS maxTime FROM messages
        WHERE churchId=${churchId} AND conversationId=${conversationId} AND personId IS NOT NULL
        GROUP BY personId
      ) latest ON latest.personId=m.personId AND latest.maxTime=m.timeSent
      WHERE m.churchId=${churchId} AND m.conversationId=${conversationId}
    `.execute(getDb());
    return result.rows as Message[];
  }

  // One round trip for the same page of several conversations: each UNION ALL part is that
  // conversation's own page (newest first). Rows come back keyed by conversationId, newest first.
  public async loadForConversationsPaginated(
    churchId: string,
    conversationIds: string[],
    page: number = 1,
    limit: number = 20
  ): Promise<Map<string, any[]>> {
    const result = new Map<string, any[]>();
    if (conversationIds.length === 0) return result;
    const offset = (page - 1) * limit;
    const parts = conversationIds.map((conversationId) => sql`(SELECT * FROM messages WHERE churchId=${churchId} AND conversationId=${conversationId} ORDER BY timeSent DESC LIMIT ${limit} OFFSET ${offset})`);
    const rows = (await sql<any>`${sql.join(parts, sql` UNION ALL `)}`.execute(getDb())).rows;
    for (const row of rows) {
      const list = result.get(row.conversationId);
      if (list) list.push(row);
      else result.set(row.conversationId, [row]);
    }
    const time = (row: any) => (row.timeSent ? new Date(row.timeSent).getTime() : 0);
    result.forEach((list) => list.sort((a, b) => time(b) - time(a)));
    return result;
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
