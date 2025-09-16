import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Automation } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class AutomationRepository extends ConfiguredRepository<Automation> {
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
