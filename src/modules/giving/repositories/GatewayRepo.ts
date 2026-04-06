import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Gateway } from "../models/index.js";

@injectable()
export class GatewayRepo {

  public async save(model: Gateway) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(gateway: Gateway): Promise<Gateway> {
    gateway.id = UniqueIdHelper.shortId();
    // Enforce a single record per church (for now)
    await getDb().deleteFrom("gateways").where("churchId", "=", gateway.churchId).where("id", "<>", gateway.id).execute();
    const settings = gateway.settings ? JSON.stringify(gateway.settings) : null;
    await getDb().insertInto("gateways").values({
      id: gateway.id,
      churchId: gateway.churchId,
      provider: gateway.provider,
      publicKey: gateway.publicKey,
      privateKey: gateway.privateKey,
      webhookKey: gateway.webhookKey,
      productId: gateway.productId,
      payFees: gateway.payFees,
      currency: gateway.currency,
      settings,
      environment: gateway.environment
    } as any).execute();
    return gateway;
  }

  private async update(gateway: Gateway): Promise<Gateway> {
    const settings = gateway.settings ? JSON.stringify(gateway.settings) : null;
    await getDb().updateTable("gateways").set({
      provider: gateway.provider,
      publicKey: gateway.publicKey,
      privateKey: gateway.privateKey,
      webhookKey: gateway.webhookKey,
      productId: gateway.productId,
      payFees: gateway.payFees,
      currency: gateway.currency,
      settings,
      environment: gateway.environment
    } as any).where("id", "=", gateway.id).where("churchId", "=", gateway.churchId).execute();
    return gateway;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("gateways").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("gateways").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    const rows = await getDb().selectFrom("gateways").selectAll().where("churchId", "=", churchId).execute();
    return rows.map(r => this.rowToModel(r));
  }

  public async loadByProvider(provider: string): Promise<Gateway[]> {
    const result = await sql<any>`SELECT * FROM gateways WHERE LOWER(provider) = LOWER(${provider})`.execute(getDb());
    return result.rows.map((r: any) => this.rowToModel(r));
  }

  private rowToModel(data: any): Gateway {
    return {
      id: data.id,
      churchId: data.churchId,
      provider: data.provider,
      publicKey: data.publicKey,
      privateKey: data.privateKey,
      webhookKey: data.webhookKey,
      productId: data.productId,
      payFees: data.payFees,
      currency: data.currency,
      settings: this.parseJson(data.settings),
      environment: data.environment,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }

  public convertToModel(_churchId: string, data: any) {
    const model = this.rowToModel(data);
    // Strip sensitive fields - privateKey/webhookKey should never be returned to clients
    const { privateKey: _privateKey, webhookKey: _webhookKey, ...safeModel } = model;
    return safeModel;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return data.map((row: any) => this.convertToModel(churchId, row));
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
