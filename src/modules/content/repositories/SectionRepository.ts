import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Section } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class SectionRepository extends ConfiguredRepository<Section> {
  protected get repoConfig(): RepoConfig<Section> {
    return {
      tableName: "sections",
      hasSoftDelete: false,
      defaultOrderBy: "sort",
      insertColumns: ["pageId", "blockId", "zone", "background", "textColor", "headingColor", "linkColor", "sort", "targetBlockId", "answersJSON", "stylesJSON", "animationsJSON"],
      updateColumns: ["pageId", "blockId", "zone", "background", "textColor", "headingColor", "linkColor", "sort", "targetBlockId", "answersJSON", "stylesJSON", "animationsJSON"]
    };
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

  public loadForBlock(churchId: string, blockId: string) {
    return TypedDB.query("SELECT * FROM sections WHERE churchId=? AND blockId=? order by sort;", [churchId, blockId]);
  }

  public loadForBlocks(churchId: string, blockIds: string[]) {
    return TypedDB.query("SELECT * FROM sections WHERE churchId=? AND blockId IN (?) order by sort;", [churchId, blockIds]);
  }

  public loadForPage(churchId: string, pageId: string) {
    return TypedDB.query("SELECT * FROM sections WHERE churchId=? AND (pageId=? or (pageId IS NULL and blockId IS NULL)) order by sort;", [churchId, pageId]);
  }

  public loadForZone(churchId: string, pageId: string, zone: string) {
    return TypedDB.query("SELECT * FROM sections WHERE churchId=? AND pageId=? AND zone=? order by sort;", [churchId, pageId, zone]);
  }

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
