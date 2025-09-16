import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { ClientError } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class ClientErrorRepository extends ConfiguredRepository<ClientError> {
  protected get repoConfig(): RepoConfig<ClientError> {
    return {
      tableName: "clientErrors",
      hasSoftDelete: false,
      insertColumns: ["application", "errorTime", "userId", "originUrl", "errorType", "message", "details"],
      updateColumns: ["application", "errorTime", "userId", "originUrl", "errorType", "message", "details"]
    };
  }

  public deleteOld() {
    return DB.query("DELETE FROM clientErrors WHERE errorTime<date_add(NOW(), INTERVAL -7 DAY)", []);
  }

  public load(id: string) {
    return DB.queryOne("SELECT * FROM clientErrors WHERE id=?;", [id]);
  }

  public loadAll() {
    return DB.query("SELECT * FROM clientErrors;", []);
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
