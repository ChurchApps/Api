import { UniqueIdHelper } from "@churchapps/apihelper";
import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Section } from "../models";

@injectable()
export class SectionRepository {
  public save(section: Section) {
    return section.id ? this.update(section) : this.create(section);
  }

  public async create(section: Section) {
    if (!section.id) section.id = UniqueIdHelper.shortId();

    const sql =
      "INSERT INTO sections (id, churchId, pageId, blockId, zone, background, textColor, headingColor, linkColor, sort, targetBlockId, answersJSON, stylesJSON, animationsJSON) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      section.id,
      section.churchId,
      section.pageId,
      section.blockId,
      section.zone,
      section.background,
      section.textColor,
      section.headingColor,
      section.linkColor,
      section.sort,
      section.targetBlockId,
      section.answersJSON,
      section.stylesJSON,
      section.animationsJSON
    ];
    await TypedDB.query(sql, params);
    return section;
  }

  private async update(section: Section) {
    const sql =
      "UPDATE sections SET pageId=?, blockId=?, zone=?, background=?, textColor=?, headingColor=?, linkColor=?, sort=?, targetBlockId=?, answersJSON=?, stylesJSON=?, animationsJSON=? WHERE id=? and churchId=?";
    const params = [
      section.pageId,
      section.blockId,
      section.zone,
      section.background,
      section.textColor,
      section.headingColor,
      section.linkColor,
      section.sort,
      section.targetBlockId,
      section.answersJSON,
      section.stylesJSON,
      section.animationsJSON,
      section.id,
      section.churchId
    ];
    await TypedDB.query(sql, params);
    return section;
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

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM sections WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM sections WHERE id=? AND churchId=?;", [id, churchId]);
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
}
