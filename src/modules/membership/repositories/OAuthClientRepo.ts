import { injectable } from "inversify";
import { eq, and, asc } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { oAuthClients } from "../../../db/schema/membership.js";
import { OAuthClient } from "../models/index.js";

@injectable()
export class OAuthClientRepo extends GlobalDrizzleRepo<typeof oAuthClients> {
  protected readonly table = oAuthClients;
  protected readonly moduleName = "membership";

  public async save(client: OAuthClient) {
    if (client.id) {
      return this.update(client);
    } else {
      return this.create(client);
    }
  }

  protected async create(client: OAuthClient): Promise<OAuthClient> {
    client.id = UniqueIdHelper.shortId();
    const data: any = { ...client, createdAt: new Date() };
    await this.db.insert(oAuthClients).values(data);
    return client;
  }

  protected async update(client: OAuthClient): Promise<OAuthClient> {
    const data: any = {
      name: client.name,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      redirectUris: client.redirectUris,
      scopes: client.scopes
    };
    await this.db.update(oAuthClients).set(data).where(eq(oAuthClients.id, client.id!));
    return client;
  }

  public load(id: string): Promise<OAuthClient> {
    return this.db.select().from(oAuthClients).where(eq(oAuthClients.id, id)).then(r => (r[0] as OAuthClient) ?? null);
  }

  public loadByClientId(clientId: string): Promise<OAuthClient> {
    return this.db.select().from(oAuthClients).where(eq(oAuthClients.clientId, clientId)).then(r => (r[0] as OAuthClient) ?? null);
  }

  public loadByClientIdAndSecret(clientId: string, clientSecret: string): Promise<OAuthClient> {
    return this.db.select().from(oAuthClients)
      .where(and(eq(oAuthClients.clientId, clientId), eq(oAuthClients.clientSecret, clientSecret)))
      .then(r => (r[0] as OAuthClient) ?? null);
  }

  public async loadAll() {
    return this.db.select().from(oAuthClients).orderBy(asc(oAuthClients.name));
  }
}
