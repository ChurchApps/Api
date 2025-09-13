import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { Campus } from "../models";
import { UniqueIdHelper, CollectionHelper } from "../../../shared/helpers";

@injectable()
export class CampusRepository {
  public save(campus: Campus) {
    return campus.id ? this.update(campus) : this.create(campus);
  }

  private async create(campus: Campus) {
    campus.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO campuses (id, churchId, name, address1, address2, city, state, zip, removed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0);";
    const params = [campus.id, campus.churchId, campus.name, campus.address1, campus.address2, campus.city, campus.state, campus.zip];
    await DB.query(sql, params);
    return campus;
  }

  private async update(campus: Campus) {
    const sql = "UPDATE campuses SET name=?, address1=?, address2=?, city=?, state=?, zip=? WHERE id=? and churchId=?";
    const params = [campus.name, campus.address1, campus.address2, campus.city, campus.state, campus.zip, campus.id, campus.churchId];
    await DB.query(sql, params);
    return campus;
  }

  public delete(churchId: string, id: string) {
    return DB.query("UPDATE campuses SET removed=1 WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM campuses WHERE id=? AND churchId=? AND removed=0;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM campuses WHERE churchId=? AND removed=0;", [churchId]);
  }

  public convertToModel(churchId: string, data: any) {
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

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<Campus>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
