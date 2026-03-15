import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { gatewayPaymentMethods } from "../../../db/schema/giving.js";
import { GatewayPaymentMethod } from "../models/index.js";

@injectable()
export class GatewayPaymentMethodRepo extends DrizzleRepo<typeof gatewayPaymentMethods> {
  protected readonly table = gatewayPaymentMethods;
  protected readonly moduleName = "giving";

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : null;
  }

  public convertAllToModel(_churchId: string, data: any) {
    return (data || []).map((row: any) => this.rowToModel(row));
  }

  public async loadByExternalId(churchId: string, gatewayId: string, externalId: string): Promise<GatewayPaymentMethod | null> {
    return this.db.select().from(gatewayPaymentMethods)
      .where(and(eq(gatewayPaymentMethods.churchId, churchId), eq(gatewayPaymentMethods.gatewayId, gatewayId), eq(gatewayPaymentMethods.externalId, externalId)))
      .limit(1)
      .then(r => r[0] ? this.rowToModel(r[0]) : null);
  }

  public async deleteByExternalId(churchId: string, gatewayId: string, externalId: string): Promise<void> {
    await this.db.delete(gatewayPaymentMethods)
      .where(and(eq(gatewayPaymentMethods.churchId, churchId), eq(gatewayPaymentMethods.gatewayId, gatewayId), eq(gatewayPaymentMethods.externalId, externalId)));
  }

  public async loadByCustomer(churchId: string, gatewayId: string, customerId: string): Promise<GatewayPaymentMethod[]> {
    const rows = await this.db.select().from(gatewayPaymentMethods)
      .where(and(eq(gatewayPaymentMethods.churchId, churchId), eq(gatewayPaymentMethods.gatewayId, gatewayId), eq(gatewayPaymentMethods.customerId, customerId)));
    return rows.map(r => this.rowToModel(r));
  }

  private rowToModel(row: any): GatewayPaymentMethod {
    return {
      id: row.id,
      churchId: row.churchId,
      gatewayId: row.gatewayId,
      customerId: row.customerId,
      externalId: row.externalId,
      methodType: row.methodType,
      displayName: row.displayName,
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
