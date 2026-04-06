import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { GatewayPaymentMethod } from "../models/index.js";

@injectable()
export class GatewayPaymentMethodRepo {

  public async save(model: GatewayPaymentMethod) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: GatewayPaymentMethod): Promise<GatewayPaymentMethod> {
    model.id = UniqueIdHelper.shortId();
    const metadata = model.metadata ? JSON.stringify(model.metadata) : null;
    await getDb().insertInto("gatewayPaymentMethods").values({
      id: model.id,
      churchId: model.churchId,
      gatewayId: model.gatewayId,
      customerId: model.customerId,
      externalId: model.externalId,
      methodType: model.methodType,
      displayName: model.displayName,
      metadata
    } as any).execute();
    return model;
  }

  private async update(model: GatewayPaymentMethod): Promise<GatewayPaymentMethod> {
    const metadata = model.metadata ? JSON.stringify(model.metadata) : null;
    await getDb().updateTable("gatewayPaymentMethods").set({
      gatewayId: model.gatewayId,
      customerId: model.customerId,
      externalId: model.externalId,
      methodType: model.methodType,
      displayName: model.displayName,
      metadata
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("gatewayPaymentMethods").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    const row = (await getDb().selectFrom("gatewayPaymentMethods").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
    return row ? this.rowToModel(row) : null;
  }

  public async loadByExternalId(churchId: string, gatewayId: string, externalId: string): Promise<GatewayPaymentMethod | null> {
    const row = (await getDb().selectFrom("gatewayPaymentMethods").selectAll()
      .where("churchId", "=", churchId)
      .where("gatewayId", "=", gatewayId)
      .where("externalId", "=", externalId)
      .limit(1)
      .executeTakeFirst()) ?? null;
    return row ? this.rowToModel(row) : null;
  }

  public async deleteByExternalId(churchId: string, gatewayId: string, externalId: string): Promise<void> {
    await getDb().deleteFrom("gatewayPaymentMethods")
      .where("churchId", "=", churchId)
      .where("gatewayId", "=", gatewayId)
      .where("externalId", "=", externalId)
      .execute();
  }

  public async loadByCustomer(churchId: string, gatewayId: string, customerId: string): Promise<GatewayPaymentMethod[]> {
    const rows = await getDb().selectFrom("gatewayPaymentMethods").selectAll()
      .where("churchId", "=", churchId)
      .where("gatewayId", "=", gatewayId)
      .where("customerId", "=", customerId)
      .execute();
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
      metadata: this.parseJson(row.metadata),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : null;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return data.map((r: any) => this.rowToModel(r));
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
