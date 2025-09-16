import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { ClientError } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class ClientErrorRepository extends ConfiguredRepository<ClientError> {
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
