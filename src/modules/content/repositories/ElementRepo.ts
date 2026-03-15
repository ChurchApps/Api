import { ArrayHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { injectable } from "inversify";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { elements } from "../../../db/schema/content.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class ElementRepo extends DrizzleRepo<typeof elements> {
  protected readonly table = elements;
  protected readonly moduleName = "content";

  public async updateSortForBlock(churchId: string, blockId: string, parentId: string) {
    const elems = await this.loadForBlock(churchId, blockId);
    const promises: Promise<any>[] = [];
    for (let i = 0; i < elems.length; i++) {
      if (elems[i].parentId === parentId) {
        if (elems[i].sort !== i + 1) {
          elems[i].sort = i + 1;
          promises.push(this.save(elems[i]));
        }
      }
    }
    if (promises.length > 0) await Promise.all(promises);
  }

  public async updateSort(churchId: string, sectionId: string, parentId: string) {
    const elems = await this.loadForSection(churchId, sectionId);
    const skipParentId = ArrayHelper.getAll(elems, "parentId", null);
    const withParentId = ArrayHelper.getAll(elems, "parentId", parentId);
    const promises: Promise<any>[] = [];
    for (let i = 0; i < skipParentId.length; i++) {
      if (skipParentId[i].sort !== i + 1) {
        skipParentId[i].sort = i + 1;
        promises.push(this.save(skipParentId[i]));
      }
    }
    for (let i = 0; i < withParentId.length; i++) {
      if (withParentId[i].sort !== i + 1) {
        withParentId[i].sort = i + 1;
        promises.push(this.save(withParentId[i]));
      }
    }
    if (promises.length > 0) await Promise.all(promises);
  }

  public loadForSection(churchId: string, sectionId: string): Promise<any[]> {
    return this.db.select().from(elements).where(and(eq(elements.churchId, churchId), eq(elements.sectionId, sectionId))).orderBy(asc(elements.sort));
  }

  public loadForBlock(churchId: string, blockId: string): Promise<any[]> {
    return this.db.select().from(elements).where(and(eq(elements.churchId, churchId), eq(elements.blockId, blockId))).orderBy(asc(elements.sort));
  }

  public loadForBlocks(churchId: string, blockIds: string[]): Promise<any[]> {
    return this.db.select().from(elements).where(and(eq(elements.churchId, churchId), inArray(elements.blockId, blockIds))).orderBy(asc(elements.sort));
  }

  public async loadForPage(churchId: string, pageId: string): Promise<any[]> {
    return this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT e.*
          FROM elements e
          INNER JOIN sections s ON s.id = e."sectionId"
          WHERE (s."pageId" = ${pageId} OR (s."pageId" IS NULL AND s."blockId" IS NULL)) AND e."churchId" = ${churchId}
          ORDER BY e.sort`
        : sql`
          SELECT e.*
          FROM elements e
          INNER JOIN sections s ON s.id = e.sectionId
          WHERE (s.pageId = ${pageId} OR (s.pageId IS NULL AND s.blockId IS NULL)) AND e.churchId = ${churchId}
          ORDER BY e.sort`
    );
  }

  public async insert(model: any) {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    await this.db.insert(elements).values(model);
    return model;
  }
}
