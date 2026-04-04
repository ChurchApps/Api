import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { SentText } from "../models/index.js";

@injectable()
export class SentTextRepo {
  public async save(model: SentText) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: SentText): Promise<SentText> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("sentTexts").values({
      id: model.id,
      churchId: model.churchId,
      groupId: model.groupId,
      recipientPersonId: model.recipientPersonId,
      senderPersonId: model.senderPersonId,
      message: model.message,
      recipientCount: model.recipientCount,
      successCount: model.successCount,
      failCount: model.failCount,
      timeSent: sql`NOW()`
    }).execute();
    return model;
  }

  private async update(model: SentText): Promise<SentText> {
    await getDb().updateTable("sentTexts").set({
      recipientCount: model.recipientCount,
      successCount: model.successCount,
      failCount: model.failCount
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadByChurchId(churchId: string) {
    return getDb().selectFrom("sentTexts").selectAll()
      .where("churchId", "=", churchId)
      .orderBy("timeSent", "desc")
      .execute();
  }

  public async loadById(churchId: string, id: string) {
    return (await getDb().selectFrom("sentTexts").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  protected rowToModel(data: any): SentText {
    return {
      id: data.id,
      churchId: data.churchId,
      groupId: data.groupId,
      recipientPersonId: data.recipientPersonId,
      senderPersonId: data.senderPersonId,
      message: data.message,
      recipientCount: data.recipientCount,
      successCount: data.successCount,
      failCount: data.failCount,
      timeSent: data.timeSent
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
