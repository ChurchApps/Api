import { Link } from "../models";
import { ArrayHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";

export class LinkRepository {
  public loadAll(churchId: string) {
    return TypedDB.query("SELECT * FROM links WHERE churchId=? order by sort", [churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM links WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByCategory(churchId: string, category: string) {
    return TypedDB.query("SELECT * FROM links WHERE churchId=? and category=? order by sort", [churchId, category]);
  }

  public save(link: Link) {
    return link.id ? this.update(link) : this.create(link);
  }

  public async sort(churchId: string, category: string, parentId: string) {
    const existing = await this.loadByCategory(churchId, category);
    const filtered = ArrayHelper.getAll(existing, "parentId", parentId);
    const toSave: Link[] = [];
    filtered.forEach((link, index) => {
      if (link.sort !== index) {
        link.sort = index;
        toSave.push(link);
      }
    });
    const promises: Promise<Link>[] = [];
    toSave.forEach((link) => promises.push(this.save(link)));
    await Promise.all(promises);
  }

  private async create(link: Link) {
    link.id = UniqueIdHelper.shortId();
    const query =
      "INSERT INTO links (id, churchId, category, url, linkType, linkData, photo, icon, text, sort, parentId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      link.id,
      link.churchId,
      link.category,
      link.url,
      link.linkType,
      link.linkData,
      link.photo,
      link.icon,
      link.text,
      link.sort,
      link.parentId
    ];
    await TypedDB.query(query, params);
    return link;
  }

  public delete(id: string, churchId: string) {
    return TypedDB.query("DELETE FROM links WHERE id=? AND churchId=?;", [id, churchId]);
  }

  private async update(link: Link) {
    const sql =
      "UPDATE links SET category=?, url=?, linkType=?, linkData=?, photo=?, icon=?, text=?, sort=?, parentId=? WHERE id=?;";
    const params = [
      link.category,
      link.url,
      link.linkType,
      link.linkData,
      link.photo,
      link.icon,
      link.text,
      link.sort,
      link.parentId,
      link.id
    ];
    await TypedDB.query(sql, params);
    return link;
  }

  public loadById(id: string, churchId: string): Promise<Link> {
    return TypedDB.queryOne("SELECT * FROM links WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result = {
      ...data
    };
    if (result.photo === undefined) {
      if (!result.photoUpdated) {
        result.photo = "";
      } else {
        result.photo = "/" + churchId + "/b1/tabs/" + data.id + ".png?dt=" + data.photoUpdated.getTime().toString();
      }
    }
    return result;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    const result: Link[] = [];
    data.forEach((d) => result.push(this.convertToModel(churchId, d)));
    return result;
  }
}
