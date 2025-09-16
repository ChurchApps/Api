import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Automation } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class AutomationRepository extends ConfiguredRepository<Automation> {
  protected get repoConfig(): RepoConfig<Automation> {
    return {
      tableName: "automations",
      hasSoftDelete: false,
      insertColumns: ["title", "recurs", "active"],
      updateColumns: ["title", "recurs", "active"]
    };
  }

  protected get defaultOrderBy(): string {
    return "title";
  }

  public loadAllChurches() {
    return TypedDB.query("SELECT * FROM automations;", []);
  }
}
