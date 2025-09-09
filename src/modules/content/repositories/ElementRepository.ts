import { ArrayHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { Element } from "../models";

export class ElementRepository {
  public save(element: Element) {
    return element.id ? this.update(element) : this.create(element);
  }

  public async create(element: Element) {
    if (!element.id) element.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO elements (id, churchId, sectionId, blockId, elementType, sort, parentId, answersJSON, stylesJSON, animationsJSON) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      element.id,
      element.churchId,
      element.sectionId,
      element.blockId,
      element.elementType,
      element.sort,
      element.parentId,
      element.answersJSON,
      element.stylesJSON,
      element.animationsJSON
    ];
    await TypedDB.query(sql, params);
    return element;
  }

  private async update(element: Element) {
    const sql = "UPDATE elements SET sectionId=?, blockId=?, elementType=?, sort=?, parentId=?, answersJSON=?, stylesJSON=?, animationsJSON=? WHERE id=? and churchId=?";
    const params = [
      element.sectionId,
      element.blockId,
      element.elementType,
      element.sort,
      element.parentId,
      element.answersJSON,
      element.stylesJSON,
      element.animationsJSON,
      element.id,
      element.churchId
    ];
    await TypedDB.query(sql, params);
    return element;
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

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM elements WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM elements WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadForSection(churchId: string, sectionId: string) {
    return TypedDB.query("SELECT * FROM elements WHERE churchId=? AND sectionId=? order by sort;", [churchId, sectionId]);
  }

  public loadForBlock(churchId: string, blockId: string) {
    return TypedDB.query("SELECT * FROM elements WHERE churchId=? AND blockId=? order by sort;", [churchId, blockId]);
  }

  public loadForBlocks(churchId: string, blockIds: string[]) {
    return TypedDB.query("SELECT * FROM elements WHERE churchId=? AND blockId IN (?) order by sort;", [churchId, blockIds]);
  }

  /*
  public loadForBlocks(churchId: string, blockIds: string[]) {
    const sql = "SELECT e.* "
      + " FROM elements e"
      + " LEFT JOIN sections s on s.id=e.sectionId"
      + " WHERE e.churchId=? AND (e.blockId IN (?) OR s.blockId IN (?))"
      + " ORDER BY sort;";
    return TypedDB.query(sql, [churchId, blockIds, blockIds]);
  }

  public loadForBlock(churchId: string, blockId: string) {
    const sql = "SELECT e.* "
      + " FROM elements e"
      + " LEFT JOIN sections s on s.id=e.sectionId"
      + " WHERE e.churchId=? AND (e.blockId=? OR s.blockId=?)"
      + " ORDER BY sort;";
    return TypedDB.query(sql, [churchId, blockId, blockId]);
  }
*/
  public loadForPage(churchId: string, pageId: string) {
    const sql =
      "SELECT e.* " + " FROM elements e" + " INNER JOIN sections s on s.id=e.sectionId" + " WHERE (s.pageId=? OR (s.pageId IS NULL and s.blockId IS NULL)) AND e.churchId=?" + " ORDER BY sort;";
    return TypedDB.query(sql, [pageId, churchId]);
  }
}
