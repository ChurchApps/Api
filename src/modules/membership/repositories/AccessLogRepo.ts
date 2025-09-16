import { injectable } from "inversify";
import { AccessLog } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class AccessLogRepo extends ConfiguredRepo<AccessLog> {
  protected get repoConfig(): RepoConfig<AccessLog> {
    return {
      tableName: "accessLogs",
      hasSoftDelete: false,
      columns: ["userId", "appName"],
      insertLiterals: { loginTime: "NOW()" }
    };
  }

  // For compatibility with existing controllers
  public async create(log: AccessLog) {
    log.id = this.createId();
    return super.save(log);
  }
}
