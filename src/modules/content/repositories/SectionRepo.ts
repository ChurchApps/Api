import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Section } from "../models/index.js";

@injectable()
export class SectionRepo {
  public async save(model: Section) {
    return model.id ? this.update(model) : this.create(model);
  }

  protected async create(model: Section): Promise<Section> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("sections").values({
      id: model.id,
      churchId: model.churchId,
      pageId: model.pageId,
      blockId: model.blockId,
      zone: model.zone,
      background: model.background,
      textColor: model.textColor,
      headingColor: model.headingColor,
      linkColor: model.linkColor,
      sort: model.sort,
      targetBlockId: model.targetBlockId,
      answersJSON: model.answersJSON,
      stylesJSON: model.stylesJSON,
      animationsJSON: model.animationsJSON
    } as any).execute();
    return model;
  }

  private async update(model: Section): Promise<Section> {
    await getDb().updateTable("sections").set({
      pageId: model.pageId,
      blockId: model.blockId,
      zone: model.zone,
      background: model.background,
      textColor: model.textColor,
      headingColor: model.headingColor,
      linkColor: model.linkColor,
      sort: model.sort,
      targetBlockId: model.targetBlockId,
      answersJSON: model.answersJSON,
      stylesJSON: model.stylesJSON,
      animationsJSON: model.animationsJSON
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("sections").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Section | undefined> {
    return (await getDb().selectFrom("sections").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Section[]> {
    return getDb().selectFrom("sections").selectAll().where("churchId", "=", churchId).orderBy("sort").execute() as any;
  }

  public async updateSortForBlock(churchId: string, blockId: string) {
    const sections = await this.loadForBlock(churchId, blockId);
    const promises: Promise<Section>[] = [];
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].sort !== i + 1) {
        sections[i].sort = i + 1;
        promises.push(this.save(sections[i]));
      }
    }
    if (promises.length > 0) await Promise.all(promises);
  }

  public async updateSort(churchId: string, pageId: string, zone: string) {
    const sections = await this.loadForZone(churchId, pageId, zone);
    const promises: Promise<Section>[] = [];
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].sort !== i + 1) {
        sections[i].sort = i + 1;
        promises.push(this.save(sections[i]));
      }
    }
    if (promises.length > 0) await Promise.all(promises);
  }

  public async loadForBlock(churchId: string, blockId: string) {
    return getDb().selectFrom("sections").selectAll()
      .where("churchId", "=", churchId)
      .where("blockId", "=", blockId)
      .orderBy("sort").execute() as any;
  }

  public async loadForBlocks(churchId: string, blockIds: string[]) {
    if (!blockIds || blockIds.length === 0) return [];
    return getDb().selectFrom("sections").selectAll()
      .where("churchId", "=", churchId)
      .where("blockId", "in", blockIds)
      .orderBy("sort").execute() as any;
  }

  public async loadForPage(churchId: string, pageId: string) {
    return getDb().selectFrom("sections").selectAll()
      .where("churchId", "=", churchId)
      .where((eb) => eb.or([
        eb("pageId", "=", pageId),
        eb.and([eb("pageId", "is", null), eb("blockId", "is", null)])
      ]))
      .orderBy("sort")
      .execute() as any;
  }

  public async loadForZone(churchId: string, pageId: string, zone: string) {
    return getDb().selectFrom("sections").selectAll()
      .where("churchId", "=", churchId)
      .where("pageId", "=", pageId)
      .where("zone", "=", zone)
      .orderBy("sort").execute() as any;
  }

  public async insert(model: Section): Promise<Section> {
    return this.create(model);
  }

  public convertToModel(_churchId: string, data: any) { return data as Section; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Section[]; }

  protected rowToModel(row: any): Section {
    return {
      id: row.id,
      churchId: row.churchId,
      pageId: row.pageId,
      blockId: row.blockId,
      zone: row.zone,
      background: row.background,
      textColor: row.textColor,
      headingColor: row.headingColor,
      linkColor: row.linkColor,
      sort: row.sort,
      targetBlockId: row.targetBlockId,
      answersJSON: row.answersJSON,
      stylesJSON: row.stylesJSON,
      animationsJSON: row.animationsJSON
    };
  }
}
