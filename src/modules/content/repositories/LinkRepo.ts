import { injectable } from "inversify";
import { Link } from "../models";
import { ArrayHelper } from "@churchapps/apihelper";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class LinkRepo extends ConfiguredRepo<Link> {
  protected get repoConfig(): RepoConfig<Link> {
    return {
      tableName: "links",
      hasSoftDelete: false,
      columns: ["category", "url", "linkType", "linkData", "photo", "icon", "text", "sort", "parentId"]
    };
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
