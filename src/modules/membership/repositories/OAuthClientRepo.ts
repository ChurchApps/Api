import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { OAuthClient } from "../models/index.js";

@injectable()
export class OAuthClientRepo {
  public async save(model: OAuthClient) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(client: OAuthClient): Promise<OAuthClient> {
    client.id = UniqueIdHelper.shortId();
    await getDb().insertInto("oAuthClients").values({
      id: client.id,
      name: client.name,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      redirectUris: client.redirectUris,
      scopes: client.scopes,
      createdAt: sql`NOW()` as any
    }).execute();
    return client;
  }

  private async update(client: OAuthClient): Promise<OAuthClient> {
    await getDb().updateTable("oAuthClients").set({
      name: client.name,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      redirectUris: client.redirectUris,
      scopes: client.scopes
    }).where("id", "=", client.id).execute();
    return client;
  }

  public async load(id: string): Promise<OAuthClient> {
    return (await getDb().selectFrom("oAuthClients").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadByClientId(clientId: string): Promise<OAuthClient> {
    return (await getDb().selectFrom("oAuthClients").selectAll().where("clientId", "=", clientId).executeTakeFirst()) ?? null;
  }

  public async loadByClientIdAndSecret(clientId: string, clientSecret: string): Promise<OAuthClient> {
    return (await getDb().selectFrom("oAuthClients").selectAll()
      .where("clientId", "=", clientId)
      .where("clientSecret", "=", clientSecret)
      .executeTakeFirst()) ?? null;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("oAuthClients").where("id", "=", id).execute();
  }

  public async loadAll() {
    return getDb().selectFrom("oAuthClients").selectAll().orderBy("name").execute();
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
