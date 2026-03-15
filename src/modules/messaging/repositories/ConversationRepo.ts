import { injectable } from "inversify";
import { eq, and, sql, inArray, gte, desc } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { conversations } from "../../../db/schema/messaging.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class ConversationRepo extends DrizzleRepo<typeof conversations> {
  protected readonly table = conversations;
  protected readonly moduleName = "messaging";

  public async save(model: any) {
    await this.cleanup();
    if (model.id) {
      const { id: _id, churchId: _cid, ...setData } = model;
      await this.db.update(conversations).set(setData)
        .where(and(eq(conversations.id, model.id), eq(conversations.churchId, model.churchId)));
    } else {
      model.id = UniqueIdHelper.shortId();
      model.dateCreated = new Date();
      model.postCount = 0;
      await this.db.insert(conversations).values(model);
    }
    return model;
  }

  private async cleanup() {
    if (getDialect() === "postgres") {
      await (this.db as any).execute(sql`DELETE FROM conversations WHERE "allowAnonymousPosts" = true AND "dateCreated" < NOW() - INTERVAL '7 days'`);
      await (this.db as any).execute(sql`DELETE FROM connections WHERE "timeJoined" < NOW() - INTERVAL '1 day'`);
      await (this.db as any).execute(sql`DELETE FROM messages WHERE "conversationId" NOT IN (SELECT id FROM conversations)`);
    } else {
      await (this.db as any).execute(sql`CALL cleanup()`);
    }
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (!ids || ids.length === 0) return [];
    const result = await this.db.select({
      id: conversations.id,
      firstPostId: conversations.firstPostId,
      lastPostId: conversations.lastPostId,
      postCount: conversations.postCount
    })
      .from(conversations)
      .where(and(eq(conversations.churchId, churchId), inArray(conversations.id, ids)));
    return result || [];
  }

  public async loadPosts(churchId: string, groupIds: string[]) {
    if (!groupIds || groupIds.length === 0) return [];
    if (getDialect() === "postgres") {
      return this.executeRows(sql`
        SELECT c."contentType", c."contentId", c."groupId", c.id, c."firstPostId", c."lastPostId", c."postCount"
        FROM conversations c
        INNER JOIN messages fp ON fp.id = c."firstPostId"
        INNER JOIN messages lp ON lp.id = c."lastPostId"
        WHERE c."churchId" = ${churchId} AND c."groupId" IN (${sql.join(groupIds.map(id => sql`${id}`), sql`, `)})
        AND lp."timeSent" > ${DateHelper.daysFromNow(-365)}
      `);
    }
    return this.executeRows(sql`
      SELECT c.contentType, c.contentId, c.groupId, c.id, c.firstPostId, c.lastPostId, c.postCount
      FROM conversations c
      INNER JOIN messages fp ON fp.id = c.firstPostId
      INNER JOIN messages lp ON lp.id = c.lastPostId
      WHERE c.churchId = ${churchId} AND c.groupId IN (${sql.join(groupIds.map(id => sql`${id}`), sql`, `)})
      AND lp.timeSent > ${DateHelper.daysFromNow(-365)}
    `);
  }

  public async loadById(churchId: string, id: string) {
    return this.db.select().from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.churchId, churchId)))
      .then(r => r[0] ?? null);
  }

  public async loadForContent(churchId: string, contentType: string, contentId: string) {
    const result = await this.db.select().from(conversations)
      .where(and(
        eq(conversations.churchId, churchId),
        eq(conversations.contentType, contentType),
        eq(conversations.contentId, contentId)
      ))
      .orderBy(desc(conversations.dateCreated));
    return result || [];
  }

  public async loadCurrent(churchId: string, contentType: string, contentId: string) {
    const cutOff = new Date();
    cutOff.setDate(cutOff.getDate() - 1);
    const result = await this.db.select().from(conversations)
      .where(and(
        eq(conversations.churchId, churchId),
        eq(conversations.contentType, contentType),
        eq(conversations.contentId, contentId),
        gte(conversations.dateCreated, cutOff)
      ))
      .orderBy(desc(conversations.dateCreated))
      .limit(1);
    return result[0] ?? null;
  }

  public async loadHostConversation(churchId: string, mainConversationId: string) {
    let rows: any[];
    if (getDialect() === "postgres") {
      rows = await this.executeRows(sql`
        SELECT c2.*
        FROM conversations c
        INNER JOIN conversations c2 ON c2."churchId" = c."churchId" AND c2."contentType" = 'streamingLiveHost' AND c2."contentId" = c."contentId"
        WHERE c.id = ${mainConversationId} AND c."churchId" = ${churchId}
        LIMIT 1
      `);
    } else {
      rows = await this.executeRows(sql`
        SELECT c2.*
        FROM conversations c
        INNER JOIN conversations c2 ON c2.churchId = c.churchId AND c2.contentType = 'streamingLiveHost' AND c2.contentId = c.contentId
        WHERE c.id = ${mainConversationId} AND c.churchId = ${churchId}
        LIMIT 1
      `);
    }
    return rows[0] ?? null;
  }

  public async updateStats(conversationId: string) {
    if (getDialect() === "postgres") {
      await (this.db as any).execute(sql`
        UPDATE conversations
        SET "postCount" = (SELECT COUNT(*) FROM messages WHERE "churchId" = conversations."churchId" AND "conversationId" = conversations.id),
            "firstPostId" = (SELECT id FROM messages WHERE "churchId" = conversations."churchId" AND "conversationId" = conversations.id ORDER BY "timeSent" LIMIT 1),
            "lastPostId" = (SELECT id FROM messages WHERE "churchId" = conversations."churchId" AND "conversationId" = conversations.id ORDER BY "timeSent" DESC LIMIT 1)
        WHERE id = ${conversationId}
      `);
    } else {
      await (this.db as any).execute(sql`CALL updateConversationStats(${conversationId})`);
    }
  }

  public async delete(churchId: string, id: string) {
    await this.db.delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.churchId, churchId)));
  }
}
