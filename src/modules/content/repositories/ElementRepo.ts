import { ArrayHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { Element } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class ElementRepo {
  public async save(model: Element) {
    return model.id ? this.update(model) : this.create(model);
  }

  protected async create(model: Element): Promise<Element> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("elements").values({
      id: model.id,
      churchId: model.churchId,
      sectionId: model.sectionId,
      blockId: model.blockId,
      elementType: model.elementType,
      sort: model.sort,
      parentId: model.parentId,
      answersJSON: model.answersJSON,
      stylesJSON: model.stylesJSON,
      animationsJSON: model.animationsJSON
    } as any).execute();
    return model;
  }

  private async update(model: Element): Promise<Element> {
    await getDb().updateTable("elements").set({
      sectionId: model.sectionId,
      blockId: model.blockId,
      elementType: model.elementType,
      sort: model.sort,
      parentId: model.parentId,
      answersJSON: model.answersJSON,
      stylesJSON: model.stylesJSON,
      animationsJSON: model.animationsJSON
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("elements").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Element | undefined> {
    return (await getDb().selectFrom("elements").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Element[]> {
    return getDb().selectFrom("elements").selectAll().where("churchId", "=", churchId).orderBy("sort").execute() as any;
  }

  public async updateSortForBlock(churchId: string, blockId: string, parentId: string) {
    const elements = await this.loadForBlock(churchId, blockId);
    const promises: Promise<Element>[] = [];
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].parentId === parentId) {
        if (elements[i].sort !== i + 1) {
          elements[i].sort = i + 1;
          promises.push(this.save(elements[i]));
        }
      }
    }
    if (promises.length > 0) await Promise.all(promises);
  }

  public async updateSort(churchId: string, sectionId: string, parentId: string) {
    const elements = await this.loadForSection(churchId, sectionId);
    const skipParentId = ArrayHelper.getAll(elements, "parentId", null);
    const withParentId = ArrayHelper.getAll(elements, "parentId", parentId);
    const promises: Promise<Element>[] = [];
    for (let i = 0; i < skipParentId.length; i++) {
      if (skipParentId[i].sort !== i + 1) {
        skipParentId[i].sort = i + 1;
        promises.push(this.save(skipParentId[i]));
      }
    }
    // for elements inside a column/slide/box
    for (let i = 0; i < withParentId.length; i++) {
      if (withParentId[i].sort !== i + 1) {
        withParentId[i].sort = i + 1;
        promises.push(this.save(withParentId[i]));
      }
    }
    if (promises.length > 0) await Promise.all(promises);
  }

  public async loadForSection(churchId: string, sectionId: string) {
    return getDb().selectFrom("elements").selectAll()
      .where("churchId", "=", churchId)
      .where("sectionId", "=", sectionId)
      .orderBy("sort").execute() as any;
  }

  public async loadForBlock(churchId: string, blockId: string) {
    return getDb().selectFrom("elements").selectAll()
      .where("churchId", "=", churchId)
      .where("blockId", "=", blockId)
      .orderBy("sort").execute() as any;
  }

  public async loadForBlocks(churchId: string, blockIds: string[]) {
    if (!blockIds || blockIds.length === 0) return [];
    return getDb().selectFrom("elements").selectAll()
      .where("churchId", "=", churchId)
      .where("blockId", "in", blockIds)
      .orderBy("sort").execute() as any;
  }

  public async loadForPage(churchId: string, pageId: string) {
    const result = await sql`SELECT e.*
      FROM elements e
      INNER JOIN sections s on s.id=e.sectionId
      WHERE (s.pageId=${pageId} OR (s.pageId IS NULL and s.blockId IS NULL)) AND e.churchId=${churchId}
      ORDER BY sort`.execute(getDb());
    return result.rows as any;
  }

  public async insert(model: Element): Promise<Element> {
    return this.create(model);
  }

  public convertToModel(_churchId: string, data: any) { return data as Element; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Element[]; }

  protected rowToModel(row: any): Element {
    return {
      id: row.id,
      churchId: row.churchId,
      sectionId: row.sectionId,
      blockId: row.blockId,
      elementType: row.elementType,
      sort: row.sort,
      parentId: row.parentId,
      answersJSON: row.answersJSON,
      stylesJSON: row.stylesJSON,
      animationsJSON: row.animationsJSON
    };
  }
}
