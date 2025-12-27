import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Gateway } from "../models";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class GatewayRepo extends ConfiguredRepo<Gateway> {
  protected get repoConfig(): RepoConfig<Gateway> {
    return {
      tableName: "gateways",
      hasSoftDelete: false,
      columns: ["provider", "publicKey", "privateKey", "webhookKey", "productId", "payFees", "currency", "settings", "environment"]
    };
  }

  // Override create to handle the custom logic
  protected async create(gateway: Gateway): Promise<Gateway> {
    gateway.id = this.createId();
    await TypedDB.query("DELETE FROM gateways WHERE churchId=? AND id<>?;", [gateway.churchId, gateway.id]); // enforce a single record per church (for now)
    const sql = "INSERT INTO gateways (id, churchId, provider, publicKey, privateKey, webhookKey, productId, payFees, currency, settings, environment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const settings = gateway.settings ? JSON.stringify(gateway.settings) : null;
    const params = [gateway.id, gateway.churchId, gateway.provider, gateway.publicKey, gateway.privateKey, gateway.webhookKey, gateway.productId, gateway.payFees, gateway.currency, settings, gateway.environment];
    await TypedDB.query(sql, params);
    return gateway;
  }

  protected async update(gateway: Gateway): Promise<Gateway> {
    const sql =
      "UPDATE gateways SET provider=?, publicKey=?, privateKey=?, webhookKey=?, productId=?, payFees=?, currency=?, settings=?, environment=? WHERE id=? AND churchId=?";
    const settings = gateway.settings ? JSON.stringify(gateway.settings) : null;
    const params = [
      gateway.provider,
      gateway.publicKey,
      gateway.privateKey,
      gateway.webhookKey,
      gateway.productId,
      gateway.payFees,
      gateway.currency,
      settings,
      gateway.environment,
      gateway.id,
      gateway.churchId
    ];
    await TypedDB.query(sql, params);
    return gateway;
  }

  protected rowToModel(data: any): Gateway {
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

  public convertToModel(churchId: string, data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(churchId: string, data: any) {
    return this.mapToModels(data);
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
