import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Gateway } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class GatewayRepository extends ConfiguredRepository<Gateway> {
  protected get repoConfig(): RepoConfig<Gateway> {
    return {
      tableName: "gateways",
      hasSoftDelete: false,
      insertColumns: ["provider", "publicKey", "privateKey", "webhookKey", "productId", "payFees"],
      updateColumns: ["provider", "publicKey", "privateKey", "webhookKey", "productId", "payFees"]
    };
  }

  // Override create to handle the custom logic
  protected async create(gateway: Gateway): Promise<Gateway> {
    gateway.id = this.createId();
    await TypedDB.query("DELETE FROM gateways WHERE churchId=? AND id<>?;", [gateway.churchId, gateway.id]); // enforce a single record per church (for now)
    const sql = "INSERT INTO gateways (id, churchId, provider, publicKey, privateKey, webhookKey, productId, payFees) VALUES (?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [gateway.id, gateway.churchId, gateway.provider, gateway.publicKey, gateway.privateKey, gateway.webhookKey, gateway.productId, gateway.payFees];
    await TypedDB.query(sql, params);
    return gateway;
  }

  protected rowToModel(data: any): Gateway {
    return {
      id: data.id,
      provider: data.provider,
      publicKey: data.publicKey,
      webhookKey: data.webhookKey,
      productId: data.productId,
      payFees: data.payFees
    };
  }

  public convertToModel(churchId: string, data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(churchId: string, data: any) {
    return this.mapToModels(data);
  }
}
