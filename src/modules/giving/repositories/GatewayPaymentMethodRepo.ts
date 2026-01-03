import { injectable } from "inversify";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { GatewayPaymentMethod } from "../models/index.js";

@injectable()
export class GatewayPaymentMethodRepo extends ConfiguredRepo<GatewayPaymentMethod> {
  protected get repoConfig(): RepoConfig<GatewayPaymentMethod> {
    return {
      tableName: "gatewayPaymentMethods",
      hasSoftDelete: false,
      columns: ["gatewayId", "customerId", "externalId", "methodType", "displayName", "metadata"]
    };
  }

  protected async create(model: GatewayPaymentMethod): Promise<GatewayPaymentMethod> {
    model.id = this.createId();
    const metadata = model.metadata ? JSON.stringify(model.metadata) : null;
    const sql =
      "INSERT INTO gatewayPaymentMethods (id, churchId, gatewayId, customerId, externalId, methodType, displayName, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      model.id,
      model.churchId,
      model.gatewayId,
      model.customerId,
      model.externalId,
      model.methodType,
      model.displayName,
      metadata
    ];
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: GatewayPaymentMethod): Promise<GatewayPaymentMethod> {
    const metadata = model.metadata ? JSON.stringify(model.metadata) : null;
    const sql =
      "UPDATE gatewayPaymentMethods SET gatewayId=?, customerId=?, externalId=?, methodType=?, displayName=?, metadata=? WHERE id=? AND churchId=?";
    const params = [
      model.gatewayId,
      model.customerId,
      model.externalId,
      model.methodType,
      model.displayName,
      metadata,
      model.id,
      model.churchId
    ];
    await TypedDB.query(sql, params);
    return model;
  }

  protected rowToModel(row: any): GatewayPaymentMethod {
    return {
      id: row.id,
      churchId: row.churchId,
      gatewayId: row.gatewayId,
      customerId: row.customerId,
      externalId: row.externalId,
      methodType: row.methodType,
      displayName: row.displayName,
      metadata: this.parseJson(row.metadata),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  public convertToModel(churchId: string, data: any) {
    return data ? this.rowToModel(data) : null;
  }

  public convertAllToModel(churchId: string, data: any) {
    return this.mapToModels(data);
  }

  public async loadByExternalId(churchId: string, gatewayId: string, externalId: string): Promise<GatewayPaymentMethod | null> {
    const sql = "SELECT * FROM gatewayPaymentMethods WHERE churchId=? AND gatewayId=? AND externalId=? LIMIT 1";
    const row = await TypedDB.queryOne(sql, [churchId, gatewayId, externalId]);
    return row ? this.rowToModel(row) : null;
  }

  public async deleteByExternalId(churchId: string, gatewayId: string, externalId: string): Promise<void> {
    const sql = "DELETE FROM gatewayPaymentMethods WHERE churchId=? AND gatewayId=? AND externalId=?";
    await TypedDB.query(sql, [churchId, gatewayId, externalId]);
  }

  public async loadByCustomer(churchId: string, gatewayId: string, customerId: string): Promise<GatewayPaymentMethod[]> {
    const sql = "SELECT * FROM gatewayPaymentMethods WHERE churchId=? AND gatewayId=? AND customerId=?";
    const rows = await TypedDB.query(sql, [churchId, gatewayId, customerId]);
    return this.mapToModels(rows);
  }

  private parseJson(value: unknown) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value as Record<string, unknown>;
  }
}
