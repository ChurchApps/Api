import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Conversation, PrivateMessage } from "../models/index.js";

// A conversations row joined with its privateMessages pair (pmId) and the last post's time.
export interface PrivateMessageRow extends Omit<Conversation, "messages"> {
  pmId?: string;
  fromPersonId?: string;
  toPersonId?: string;
  conversationId?: string;
  notifyPersonId?: string;
  lastMessageTime?: Date;
}

@injectable()
export class PrivateMessageRepo {
  public async save(model: PrivateMessage) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: PrivateMessage): Promise<PrivateMessage> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("privateMessages").values({
      id: model.id,
      churchId: model.churchId,
      fromPersonId: model.fromPersonId,
      toPersonId: model.toPersonId,
      conversationId: model.conversationId,
      notifyPersonId: model.notifyPersonId
    }).execute();
    return model;
  }

  private async update(model: PrivateMessage): Promise<PrivateMessage> {
    await getDb().updateTable("privateMessages").set({
      fromPersonId: model.fromPersonId,
      toPersonId: model.toPersonId,
      conversationId: model.conversationId,
      notifyPersonId: model.notifyPersonId
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadById(churchId: string, id: string) {
    return (await getDb().selectFrom("privateMessages").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByPersonId(churchId: string, personId: string) {
    const result = await sql<PrivateMessageRow>`
      SELECT c.*, pm.id as pmId, pm.fromPersonId, pm.toPersonId, pm.notifyPersonId, m.timeSent as lastMessageTime
      FROM privateMessages pm
      INNER JOIN conversations c on c.id=pm.conversationId
      LEFT JOIN messages m on m.id=c.lastPostId
      WHERE pm.churchId=${churchId} AND (pm.fromPersonId=${personId} OR pm.toPersonId=${personId})
      ORDER BY COALESCE(m.timeSent, c.dateCreated) DESC
    `.execute(getDb());
    return (result.rows || []).map((d) => this.rowToModel(d));
  }

  public async loadExisting(churchId: string, personA: string, personB: string) {
    const result = await sql<PrivateMessageRow>`
      SELECT c.*, pm.id as pmId, pm.fromPersonId, pm.toPersonId, pm.notifyPersonId, m.timeSent as lastMessageTime
      FROM privateMessages pm
      INNER JOIN conversations c on c.id=pm.conversationId
      LEFT JOIN messages m on m.id=c.lastPostId
      WHERE pm.churchId=${churchId}
        AND ((pm.fromPersonId=${personA} AND pm.toPersonId=${personB}) OR (pm.fromPersonId=${personB} AND pm.toPersonId=${personA}))
      ORDER BY COALESCE(m.timeSent, c.dateCreated) DESC
      LIMIT 1
    `.execute(getDb());
    const row = (result.rows || [])[0];
    return row ? this.rowToModel(row) : null;
  }

  public async loadByChurchId(churchId: string) {
    return getDb().selectFrom("privateMessages").selectAll()
      .where("churchId", "=", churchId)
      .execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("privateMessages").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async loadByConversationId(churchId: string, conversationId: string) {
    return (await getDb().selectFrom("privateMessages").selectAll()
      .where("churchId", "=", churchId)
      .where("conversationId", "=", conversationId)
      .executeTakeFirst()) ?? null;
  }

  protected rowToModel(data: PrivateMessageRow): PrivateMessage {
    const result: PrivateMessage = {
      id: data.pmId || data.id,
      churchId: data.churchId,
      fromPersonId: data.fromPersonId,
      toPersonId: data.toPersonId,
      conversationId: data.pmId ? data.id : data.conversationId,
      notifyPersonId: data.notifyPersonId,
      lastMessageTime: data.lastMessageTime,

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

  public convertToModel(data: PrivateMessageRow) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: PrivateMessageRow[]) {
    return data.map((d) => this.rowToModel(d));
  }
}
