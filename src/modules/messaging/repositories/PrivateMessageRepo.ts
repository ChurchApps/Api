import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { PrivateMessage } from "../models/index.js";

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
      notifyPersonId: model.notifyPersonId,
      deliveryMethod: model.deliveryMethod
    }).execute();
    return model;
  }

  private async update(model: PrivateMessage): Promise<PrivateMessage> {
    await getDb().updateTable("privateMessages").set({
      fromPersonId: model.fromPersonId,
      toPersonId: model.toPersonId,
      conversationId: model.conversationId,
      notifyPersonId: model.notifyPersonId,
      deliveryMethod: model.deliveryMethod
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadById(churchId: string, id: string) {
    return (await getDb().selectFrom("privateMessages").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByPersonId(churchId: string, personId: string) {
    const result = await sql<any>`
      SELECT c.*, pm.id as pmId, pm.fromPersonId, pm.toPersonId, pm.notifyPersonId, pm.deliveryMethod, m.timeSent as lastMessageTime
      FROM privateMessages pm
      INNER JOIN conversations c on c.id=pm.conversationId
      LEFT JOIN messages m on m.id=c.lastPostId
      WHERE pm.churchId=${churchId} AND (pm.fromPersonId=${personId} OR pm.toPersonId=${personId})
      ORDER BY COALESCE(m.timeSent, c.dateCreated) DESC
    `.execute(getDb());
    return (result.rows || []).map((d: any) => this.rowToModel(d));
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

  public async loadUndelivered() {
    const result = await getDb().selectFrom("privateMessages").selectAll()
      .where("notifyPersonId", "is not", null)
      .where((eb) =>
        eb.or([
          eb("deliveryMethod", "is", null),
          eb("deliveryMethod", "=", ""),
          eb("deliveryMethod", "=", "push"),
          eb("deliveryMethod", "=", "socket"),
          eb("deliveryMethod", "=", "email")
        ]))
      .execute();
    return result.map((d: any) => this.rowToModel(d));
  }

  public async markAllRead(churchId: string, personId: string) {
    await getDb().updateTable("privateMessages").set({
      notifyPersonId: null,
      deliveryMethod: "complete"
    }).where("churchId", "=", churchId).where("notifyPersonId", "=", personId).execute();
  }

  public async loadPendingEscalation() {
    return getDb().selectFrom("privateMessages").selectAll()
      .where("notifyPersonId", "is not", null)
      .where("deliveryMethod", "in", ["socket", "push"])
      .execute();
  }

  protected rowToModel(data: any): PrivateMessage {
    const result: PrivateMessage = {
      id: data.pmId || data.id,
      churchId: data.churchId,
      fromPersonId: data.fromPersonId,
      toPersonId: data.toPersonId,
      conversationId: data.pmId ? data.id : data.conversationId,
      notifyPersonId: data.notifyPersonId,
      deliveryMethod: data.deliveryMethod,

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

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
