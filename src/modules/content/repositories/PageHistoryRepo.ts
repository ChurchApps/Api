import { injectable } from "inversify";
import { eq, and, desc, sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { pageHistory } from "../../../db/schema/content.js";

@injectable()
export class PageHistoryRepo extends DrizzleRepo<typeof pageHistory> {
  protected readonly table = pageHistory;
  protected readonly moduleName = "content";

  public loadForPage(churchId: string, pageId: string, limit: number = 50) {
    return this.db.select().from(pageHistory)
      .where(and(eq(pageHistory.churchId, churchId), eq(pageHistory.pageId, pageId)))
      .orderBy(desc(pageHistory.createdDate))
      .limit(limit);
  }

  public loadForBlock(churchId: string, blockId: string, limit: number = 50) {
    return this.db.select().from(pageHistory)
      .where(and(eq(pageHistory.churchId, churchId), eq(pageHistory.blockId, blockId)))
      .orderBy(desc(pageHistory.createdDate))
      .limit(limit);
  }

  public async deleteOldHistory(churchId: string, pageId: string, daysToKeep: number = 30) {
    await this.db.execute(sql`
      DELETE FROM pageHistory WHERE churchId = ${churchId} AND pageId = ${pageId} AND createdDate < DATE_SUB(NOW(), INTERVAL ${daysToKeep} DAY)
    `);
  }
}
