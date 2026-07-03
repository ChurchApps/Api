import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { Campus } from "../models/index.js";

// DEPRECATED: read-only/frozen; campuses mastered in membership module, slated for deletion.
@injectable()
export class CampusRepo {
  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("campuses").selectAll().where("id", "=", id).where("churchId", "=", churchId).where("removed", "=", false).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("campuses").selectAll().where("churchId", "=", churchId).where("removed", "=", false).orderBy("name").execute();
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return (data || []).map(row => this.rowToModel(row));
  }

  protected rowToModel(data: any): Campus {
    const result: Campus = {
      id: data.id,
      name: data.name,
      address1: data.address1,
      address2: data.address2,
      city: data.city,
      state: data.state,
      zip: data.zip,
      importKey: data.importKey
    };
    return result;
  }
}
