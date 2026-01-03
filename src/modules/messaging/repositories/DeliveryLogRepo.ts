import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { DeliveryLog } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { injectable } from "inversify";

@injectable()
export class DeliveryLogRepo extends ConfiguredRepo<DeliveryLog> {
  protected get repoConfig(): RepoConfig<DeliveryLog> {
    return {
      tableName: "deliveryLogs",
      hasSoftDelete: false,
      insertColumns: ["personId", "contentType", "contentId", "deliveryMethod", "success", "errorMessage", "deliveryAddress"],
      updateColumns: ["success", "errorMessage"],
      insertLiterals: { attemptTime: "NOW()" }
    };
  }

  public loadById(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM deliveryLogs WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByContent(contentType: string, contentId: string) {
    return TypedDB.query("SELECT * FROM deliveryLogs WHERE contentType=? AND contentId=? ORDER BY attemptTime DESC", [contentType, contentId]);
  }

  public loadByPerson(churchId: string, personId: string, startDate?: Date, endDate?: Date) {
    let sql = "SELECT * FROM deliveryLogs WHERE churchId=? AND personId=?";
    const params: any[] = [churchId, personId];
    if (startDate) {
      sql += " AND attemptTime >= ?";
      params.push(startDate);
    }
    if (endDate) {
      sql += " AND attemptTime <= ?";
      params.push(endDate);
    }
    sql += " ORDER BY attemptTime DESC";
    return TypedDB.query(sql, params);
  }

  public loadRecent(churchId: string, limit: number = 100) {
    return TypedDB.query("SELECT * FROM deliveryLogs WHERE churchId=? ORDER BY attemptTime DESC LIMIT ?", [churchId, limit]);
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM deliveryLogs WHERE id=? AND churchId=?;", [id, churchId]);
  }

  protected rowToModel(data: any): DeliveryLog {
    return {
      id: data.id,
      churchId: data.churchId,
      personId: data.personId,
      contentType: data.contentType,
      contentId: data.contentId,
      deliveryMethod: data.deliveryMethod,
      success: data.success,
      errorMessage: data.errorMessage,
      deliveryAddress: data.deliveryAddress,
      attemptTime: data.attemptTime
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any) {
    return this.mapToModels(data);
  }
}
