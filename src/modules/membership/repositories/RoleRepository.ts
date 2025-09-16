import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Role } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";
import { injectable } from "inversify";

@injectable()
export class RoleRepository extends ConfiguredRepository<Role> {
  protected get repoConfig(): RepoConfig<Role> {
    return {
      tableName: "roles",
      hasSoftDelete: false,
      columns: ["name"]
    };
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

  protected rowToModel(row: any): Role {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name
    };
  }

  public loadById(churchId: string, id: string): Promise<Role> {
    return this.loadOne(churchId, id) as Promise<Role>;
  }
}
