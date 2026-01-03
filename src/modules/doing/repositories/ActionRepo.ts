import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { Action } from "../models/index.js";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class ActionRepo extends ConfiguredRepo<Action> {
  protected get repoConfig(): RepoConfig<Action> {
    return {
      tableName: "actions",
      hasSoftDelete: false,
      columns: ["automationId", "actionType", "actionData"]
    };
  }

  public loadForAutomation(churchId: string, automationId: string) {
    return TypedDB.query("SELECT * FROM actions WHERE automationId=? AND churchId=?;", [automationId, churchId]);
  }
}
