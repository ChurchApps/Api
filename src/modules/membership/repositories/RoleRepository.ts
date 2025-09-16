import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Role } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { UniqueIdHelper } from "../helpers";

export class RoleRepository {
  public save(role: Role) {
    return role.id ? this.update(role) : this.create(role);
  }

  private async create(role: Role) {
    role.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO roles (id, churchId, name) VALUES (?, ?, ?);";
    const params = [role.id, role.churchId, role.name];
    await TypedDB.query(sql, params);
    return role;
  }

  private async update(role: Role) {
    const sql = "UPDATE roles SET name=? WHERE id=?";
    const params = [role.name, role.id];
    await TypedDB.query(sql, params);
    return role;
  }

  public delete(churchId: string, id: string) {
    const sql = "DELETE FROM roles WHERE id=? AND churchId=?";
    const params = [id, churchId];
    return TypedDB.query(sql, params);
  }

  public loadById(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM roles WHERE churchId=? AND id=?", [churchId, id]).then((row: Role) => {
      return row;
    });
  }

  public loadByIds(ids: string[]) {
    return TypedDB.query("SELECT * FROM roles WHERE id IN (?)", [ids]).then((rows: Role[]) => {
      return rows;
    });
  }

  public loadAll() {
    return TypedDB.query("SELECT * FROM roles", []).then((rows: Role[]) => {
      return rows;
    });
  }

  public loadByChurchId(id: string) {
    return TypedDB.query("SELECT * FROM roles WHERE churchId=?", [id]).then((rows: Role[]) => rows);
  }

  public convertToModel(churchId: string, data: any) {
    const result: Role = { id: data.id, churchId: data.churchId, name: data.name };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<Role>(data, (r: any) => this.convertToModel(churchId, r));
  }
}
