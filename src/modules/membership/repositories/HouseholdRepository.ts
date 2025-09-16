import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Household } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class HouseholdRepository extends ConfiguredRepository<Household> {
  protected get repoConfig(): RepoConfig<Household> {
    return {
      tableName: "households",
      hasSoftDelete: false,
      columns: ["name"]
    };
  }

  public deleteUnused(churchId: string) {
    return TypedDB.query("DELETE FROM households WHERE churchId=? AND id not in (SELECT householdId FROM people WHERE churchId=? AND householdId IS NOT NULL group by householdId)", [
      churchId,
      churchId
    ]);
  }

  protected rowToModel(row: any): Household {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name
    };
  }
}
