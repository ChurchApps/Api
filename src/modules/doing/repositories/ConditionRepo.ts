import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Condition } from "../models";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class ConditionRepo extends ConfiguredRepo<Condition> {
  protected get repoConfig(): RepoConfig<Condition> {
    return {
      tableName: "conditions",
      hasSoftDelete: false,
      columns: ["conjunctionId", "field", "fieldData", "operator", "value", "label"]
    };
  }

  public loadForAutomation(churchId: string, automationId: string) {
    return TypedDB.query("SELECT * FROM conditions WHERE conjunctionId IN (SELECT id FROM conjunctions WHERE automationId=?) AND churchId=?;", [automationId, churchId]);
  }
}
