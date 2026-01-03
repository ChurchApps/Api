import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { Role } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { injectable } from "inversify";

@injectable()
export class RoleRepo extends ConfiguredRepo<Role> {
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
