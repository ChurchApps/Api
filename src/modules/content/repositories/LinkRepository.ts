import { injectable } from "inversify";
import { Link } from "../models";
import { ArrayHelper } from "@churchapps/apihelper";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class LinkRepository extends ConfiguredRepository<Link> {
  protected get repoConfig(): RepoConfig<Link> {
    return {
      tableName: "links",
      hasSoftDelete: false,
      insertColumns: ["category", "url", "linkType", "linkData", "photo", "icon", "text", "sort", "parentId"],
      updateColumns: ["category", "url", "linkType", "linkData", "photo", "icon", "text", "sort", "parentId"]
    };
  }

  // Override to use TypedDB instead of DB
  protected async create(model: Link): Promise<Link> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    const { sql, params } = this.buildInsert(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: Link): Promise<Link> {
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
  }

  public async loadAll(churchId: string): Promise<Link[]> {
    return TypedDB.query("SELECT * FROM links WHERE churchId=? order by sort", [churchId]);
  }

  public async load(churchId: string, id: string): Promise<Link> {
    return TypedDB.queryOne("SELECT * FROM links WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async delete(id: string, churchId: string): Promise<any> {
    return TypedDB.query("DELETE FROM links WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByCategory(churchId: string, category: string) {
    return TypedDB.query("SELECT * FROM links WHERE churchId=? and category=? order by sort", [churchId, category]);
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

  public loadById(id: string, churchId: string): Promise<Link> {
    return TypedDB.queryOne("SELECT * FROM links WHERE id=? AND churchId=?;", [id, churchId]);
  }

  protected rowToModel(row: any): Link {
    const result = {
      ...row
    };
    if (result.photo === undefined) {
      if (!result.photoUpdated) {
        result.photo = "";
      } else {
        result.photo = "/" + result.churchId + "/b1/tabs/" + row.id + ".png?dt=" + row.photoUpdated.getTime().toString();
      }
    }
    return result;
  }
}
