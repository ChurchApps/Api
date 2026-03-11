import { injectable } from "inversify";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { sections } from "../../../db/schema/content.js";

@injectable()
export class SectionRepo extends DrizzleRepo<typeof sections> {
  protected readonly table = sections;
  protected readonly moduleName = "content";

  public async updateSortForBlock(churchId: string, blockId: string) {
    const secs = await this.loadForBlock(churchId, blockId);
    const promises: Promise<any>[] = [];
    for (let i = 0; i < secs.length; i++) {
      if (secs[i].sort !== i + 1) {
        secs[i].sort = i + 1;
        promises.push(this.save(secs[i]));
      }
    }
    if (promises.length > 0) await Promise.all(promises);
  }

  public async updateSort(churchId: string, pageId: string, zone: string) {
    const secs = await this.loadForZone(churchId, pageId, zone);
    const promises: Promise<any>[] = [];
    for (let i = 0; i < secs.length; i++) {
      if (secs[i].sort !== i + 1) {
        secs[i].sort = i + 1;
        promises.push(this.save(secs[i]));
      }
    }
    if (promises.length > 0) await Promise.all(promises);
  }

  public loadForBlock(churchId: string, blockId: string) {
    return this.db.select().from(sections).where(and(eq(sections.churchId, churchId), eq(sections.blockId, blockId))).orderBy(asc(sections.sort));
  }

  public loadForBlocks(churchId: string, blockIds: string[]) {
    return this.db.select().from(sections).where(and(eq(sections.churchId, churchId), inArray(sections.blockId, blockIds))).orderBy(asc(sections.sort));
  }

  public loadForPage(churchId: string, pageId: string) {
    return this.db.select().from(sections).where(and(
      eq(sections.churchId, churchId),
      sql`(${sections.pageId} = ${pageId} OR (${sections.pageId} IS NULL AND ${sections.blockId} IS NULL))`
    )).orderBy(asc(sections.sort));
  }

  public loadForZone(churchId: string, pageId: string, zone: string) {
    return this.db.select().from(sections).where(and(eq(sections.churchId, churchId), eq(sections.pageId, pageId), eq(sections.zone, zone))).orderBy(asc(sections.sort));
  }

  public async insert(model: any) {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    await this.db.insert(sections).values(model);
    return model;
  }
}
