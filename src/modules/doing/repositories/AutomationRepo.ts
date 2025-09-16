import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Automation } from "../models";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class AutomationRepo extends ConfiguredRepo<Automation> {
  protected get repoConfig(): RepoConfig<Automation> {
    return {
      tableName: "automations",
      hasSoftDelete: false,
      defaultOrderBy: "title",
      columns: ["title", "recurs", "active"]
    };
  }

  public loadAllChurches() {
    return TypedDB.query("SELECT * FROM automations;", []);
  }
}
