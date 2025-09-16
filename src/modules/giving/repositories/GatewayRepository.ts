import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Gateway } from "../models";
import { CollectionHelper } from "../../../shared/helpers";

@injectable()
export class GatewayRepository {
  public save(gateway: Gateway) {
    return gateway.id ? this.update(gateway) : this.create(gateway);
  }

  private async create(gateway: Gateway) {
    gateway.id = UniqueIdHelper.shortId();
    await TypedDB.query("DELETE FROM gateways WHERE churchId=? AND id<>?;", [gateway.churchId, gateway.id]); // enforce a single record per church (for now)
    const sql = "INSERT INTO gateways (id, churchId, provider, publicKey, privateKey, webhookKey, productId, payFees) VALUES (?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [gateway.id, gateway.churchId, gateway.provider, gateway.publicKey, gateway.privateKey, gateway.webhookKey, gateway.productId, gateway.payFees];
    await TypedDB.query(sql, params);
    return gateway;
  }

  private async update(gateway: Gateway) {
    const sql = "UPDATE gateways SET provider=?, publicKey=?, privateKey=?, webhookKey=?, productId=?, payFees=? WHERE id=? and churchId=?";
    const params = [gateway.provider, gateway.publicKey, gateway.privateKey, gateway.webhookKey, gateway.productId, gateway.payFees, gateway.id, gateway.churchId];
    await TypedDB.query(sql, params);
    return gateway;
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM gateways WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM gateways WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return TypedDB.query("SELECT * FROM gateways WHERE churchId=?;", [churchId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: Gateway = {
      id: data.id,
      provider: data.provider,
      publicKey: data.publicKey,
      webhookKey: data.webhookKey,
      productId: data.productId,
      payFees: data.payFees
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<Gateway>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
