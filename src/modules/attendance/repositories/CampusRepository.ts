import { injectable } from "inversify";
import { ConfiguredRepository, type RepoConfig } from "../../../shared/infrastructure";
import { Campus } from "../models";

@injectable()
export class CampusRepository extends ConfiguredRepository<Campus> {
  protected get repoConfig(): RepoConfig<Campus> {
    return {
      tableName: "campuses",
      hasSoftDelete: true,
      defaultOrderBy: "name",
      columns: ["name", "address1", "address2", "city", "state", "zip"],
      insertLiterals: { removed: "0" }
    };
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
