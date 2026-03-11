import { injectable } from "inversify";
import { eq, and, sql, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { privateMessages } from "../../../db/schema/messaging.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class PrivateMessageRepo extends DrizzleRepo<typeof privateMessages> {
  protected readonly table = privateMessages;
  protected readonly moduleName = "messaging";

  public async loadByPersonId(churchId: string, personId: string): Promise<any[]> {
    return this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT c.*, pm.id AS "pmId", pm."fromPersonId", pm."toPersonId", pm."notifyPersonId", pm."deliveryMethod", m."timeSent" AS "lastMessageTime"
          FROM "privateMessages" pm
          INNER JOIN conversations c ON c.id = pm."conversationId"
          LEFT JOIN messages m ON m.id = c."lastPostId"
          WHERE pm."churchId" = ${churchId} AND (pm."fromPersonId" = ${personId} OR pm."toPersonId" = ${personId})
          ORDER BY COALESCE(m."timeSent", c."dateCreated") DESC`
        : sql`
          SELECT c.*, pm.id AS pmId, pm.fromPersonId, pm.toPersonId, pm.notifyPersonId, pm.deliveryMethod, m.timeSent AS lastMessageTime
          FROM privateMessages pm
          INNER JOIN conversations c ON c.id = pm.conversationId
          LEFT JOIN messages m ON m.id = c.lastPostId
          WHERE pm.churchId = ${churchId} AND (pm.fromPersonId = ${personId} OR pm.toPersonId = ${personId})
          ORDER BY COALESCE(m.timeSent, c.dateCreated) DESC`
    );
  }

  public async loadById(churchId: string, id: string) {
    return this.loadOne(churchId, id);
  }

  public async loadByChurchId(churchId: string) {
    const result = await this.db.select().from(privateMessages)
      .where(eq(privateMessages.churchId, churchId));
    return result || [];
  }

  public async loadByConversationId(churchId: string, conversationId: string) {
    return this.db.select().from(privateMessages)
      .where(and(eq(privateMessages.churchId, churchId), eq(privateMessages.conversationId, conversationId)))
      .then(r => r[0] ?? null);
  }

  public async loadUndelivered() {
    const result = await this.db.select().from(privateMessages)
      .where(and(
        sql`${privateMessages.notifyPersonId} IS NOT NULL`,
        sql`(${privateMessages.deliveryMethod} IS NULL OR ${privateMessages.deliveryMethod} = '' OR ${privateMessages.deliveryMethod} = 'push' OR ${privateMessages.deliveryMethod} = 'socket' OR ${privateMessages.deliveryMethod} = 'email')`
      ));
    return result || [];
  }

  public async markAllRead(churchId: string, personId: string) {
    await this.db.update(privateMessages)
      .set({ notifyPersonId: null, deliveryMethod: "complete" })
      .where(and(eq(privateMessages.churchId, churchId), eq(privateMessages.notifyPersonId, personId)));
  }

  public async loadPendingEscalation() {
    const result = await this.db.select().from(privateMessages)
      .where(and(
        sql`${privateMessages.notifyPersonId} IS NOT NULL`,
        inArray(privateMessages.deliveryMethod, ["socket", "push"])
      ));
    return result || [];
  }
}
