import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Conjunction } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class ConjunctionRepository extends ConfiguredRepository<Conjunction> {
  protected get repoConfig(): RepoConfig<Conjunction> {
    return {
      tableName: "conjunctions",
      hasSoftDelete: false,
      insertColumns: ["automationId", "parentId", "groupType"],
      updateColumns: ["automationId", "parentId", "groupType"]
    };
  }

  public loadForAutomation(churchId: string, automationId: string) {
    return TypedDB.query("SELECT * FROM conjunctions WHERE automationId=? AND churchId=?;", [automationId, churchId]);
  }
}
