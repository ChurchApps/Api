import { injectable } from "inversify";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { messages } from "../../../db/schema/messaging.js";

@injectable()
export class MessageRepo extends DrizzleRepo<typeof messages> {
  protected readonly table = messages;
  protected readonly moduleName = "messaging";

  public async save(model: any) {
    if (model.id) {
      await this.db.update(messages).set(model)
        .where(and(eq(messages.id, model.id), eq(messages.churchId, model.churchId)));
    } else {
      model.id = UniqueIdHelper.shortId();
      model.timeSent = new Date();
      await this.db.insert(messages).values(model);
    }
    return model;
  }

  public async loadById(churchId: string, id: string): Promise<any> {
    const result = await this.db.select().from(messages)
      .where(and(eq(messages.id, id), eq(messages.churchId, churchId)))
      .then(r => r[0] ?? null);
    return result || {};
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (!ids || ids.length === 0) return [];
    const result = await this.db.select().from(messages)
      .where(and(inArray(messages.id, ids), eq(messages.churchId, churchId)));
    return result || [];
  }

  public async loadForConversation(churchId: string, conversationId: string) {
    const result = await this.db.select().from(messages)
      .where(and(eq(messages.churchId, churchId), eq(messages.conversationId, conversationId)))
      .orderBy(asc(messages.timeSent));
    return result || [];
  }

  public async loadForConversationPaginated(
    churchId: string,
    conversationId: string,
    page: number = 1,
    limit: number = 20
  ) {
    const offset = (page - 1) * limit;
    const result = await this.db.select().from(messages)
      .where(and(eq(messages.churchId, churchId), eq(messages.conversationId, conversationId)))
      .orderBy(desc(messages.timeSent))
      .limit(limit)
      .offset(offset);
    return result || [];
  }

  public async delete(churchId: string, id: string) {
    await this.db.delete(messages)
      .where(and(eq(messages.id, id), eq(messages.churchId, churchId)));
  }
}
