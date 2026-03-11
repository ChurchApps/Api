import { injectable } from "inversify";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { sermons } from "../../../db/schema/content.js";

@injectable()
export class SermonRepo extends DrizzleRepo<typeof sermons> {
  protected readonly table = sermons;
  protected readonly moduleName = "content";

  public loadById(id: string, churchId: string) {
    return this.loadOne(churchId, id);
  }

  public override async loadAll(churchId: string) {
    return this.db.select().from(sermons).where(eq(sermons.churchId, churchId)).orderBy(desc(sermons.publishDate));
  }

  public loadPublicAll(churchId: string) {
    return this.db.select().from(sermons).where(eq(sermons.churchId, churchId)).orderBy(desc(sermons.publishDate));
  }

  public async loadTimeline(sermonIds: string[]): Promise<any[]> {
    return this.executeRows(sql`
      SELECT 'sermon' as postType, id as postId, title, description, thumbnail
      FROM sermons
      WHERE id IN (${sql.join(sermonIds.map(id => sql`${id}`), sql`, `)})
    `);
  }
}
