import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Conjunction } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class ConjunctionRepo extends ConfiguredRepo<Conjunction> {
  protected get repoConfig(): RepoConfig<Conjunction> {
    return {
      tableName: "conjunctions",
      hasSoftDelete: false,
      columns: ["automationId", "parentId", "groupType"]
    };
  }

  public loadForAutomation(churchId: string, automationId: string) {
    return TypedDB.query("SELECT * FROM conjunctions WHERE automationId=? AND churchId=?;", [automationId, churchId]);
  }
}
