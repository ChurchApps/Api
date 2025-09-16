import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { ClientError } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { ConfiguredRepository } from "../../../shared/repositories/ConfiguredRepository";

@injectable()
export class ClientErrorRepository extends ConfiguredRepository<ClientError> {
  public constructor() {
    super("clientErrors", [
      { name: "id", type: "string", primaryKey: true },
      { name: "application", type: "string" },
      { name: "errorTime", type: "datetime" },
      { name: "userId", type: "string" },
      { name: "churchId", type: "string" },
      { name: "originUrl", type: "string" },
      { name: "errorType", type: "string" },
      { name: "message", type: "string" },
      { name: "details", type: "string" }
    ]);
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

  public convertToModel(churchId: string, data: any): ClientError {
    const result: ClientError = {
      id: data.id,
      application: data.application,
      errorTime: data.errorTime,
      userId: data.userId,
      churchId: data.churchId,
      originUrl: data.originUrl,
      errorType: data.errorType,
      message: data.message,
      details: data.details
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any): ClientError[] {
    return CollectionHelper.convertAll<ClientError>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
