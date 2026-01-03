import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { ClientError } from "../models/index.js";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class ClientErrorRepo extends ConfiguredRepo<ClientError> {
  protected get repoConfig(): RepoConfig<ClientError> {
    return {
      tableName: "clientErrors",
      hasSoftDelete: false,
      columns: ["application", "errorTime", "userId", "originUrl", "errorType", "message", "details"]
    };
  }

  public deleteOld() {
    return TypedDB.query("DELETE FROM clientErrors WHERE errorTime<date_add(NOW(), INTERVAL -7 DAY)", []);
  }

  public load(id: string) {
    return TypedDB.queryOne("SELECT * FROM clientErrors WHERE id=?;", [id]);
  }

  public loadAll() {
    return TypedDB.query("SELECT * FROM clientErrors;", []);
  }

  protected rowToModel(row: any): ClientError {
    return {
      id: row.id,
      application: row.application,
      errorTime: row.errorTime,
      userId: row.userId,
      churchId: row.churchId,
      originUrl: row.originUrl,
      errorType: row.errorType,
      message: row.message,
      details: row.details
    };
  }
}
