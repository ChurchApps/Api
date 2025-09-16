import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { OAuthClient } from "../models";
import { BaseRepo } from "../../../shared/infrastructure/BaseRepo";
import { injectable } from "inversify";

@injectable()
export class OAuthClientRepo extends BaseRepo<OAuthClient> {
  protected tableName = "oAuthClients";
  protected hasSoftDelete = false;
  protected async create(client: OAuthClient): Promise<OAuthClient> {
    client.id = this.createId();
    const sql = "INSERT INTO oAuthClients (id, name, clientId, clientSecret, redirectUris, scopes, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW());";
    const params = [client.id, client.name, client.clientId, client.clientSecret, client.redirectUris, client.scopes];
    await TypedDB.query(sql, params);
    return client;
  }

  protected async update(client: OAuthClient): Promise<OAuthClient> {
    const sql = "UPDATE oAuthClients SET name=?, clientId=?, clientSecret=?, redirectUris=?, scopes=? WHERE id=?;";
    const params = [client.name, client.clientId, client.clientSecret, client.redirectUris, client.scopes, client.id];
    await TypedDB.query(sql, params);
    return client;
  }

  public load(id: string): Promise<OAuthClient> {
    return TypedDB.queryOne("SELECT * FROM oAuthClients WHERE id=?", [id]);
  }

  public loadByClientId(clientId: string): Promise<OAuthClient> {
    return TypedDB.queryOne("SELECT * FROM oAuthClients WHERE clientId=?", [clientId]);
  }

  public loadByClientIdAndSecret(clientId: string, clientSecret: string): Promise<OAuthClient> {
    return TypedDB.queryOne("SELECT * FROM oAuthClients WHERE clientId=? AND clientSecret=?", [clientId, clientSecret]);
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM oAuthClients WHERE id=?", [id]);
  }

  public async loadAll() {
    return TypedDB.query("SELECT * FROM oAuthClients ORDER BY name", []);
  }
}
