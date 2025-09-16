import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Action } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class ActionRepository extends ConfiguredRepository<Action> {
  protected get repoConfig(): RepoConfig<Action> {
    return {
      tableName: "actions",
      hasSoftDelete: false,
      insertColumns: ["automationId", "actionType", "actionData"],
      updateColumns: ["automationId", "actionType", "actionData"]
    };
  }

  public loadForAutomation(churchId: string, automationId: string) {
    return TypedDB.query("SELECT * FROM actions WHERE automationId=? AND churchId=?;", [automationId, churchId]);
  }
}
