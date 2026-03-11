import { injectable } from "inversify";
import { eq, and, lt } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { oAuthTokens } from "../../../db/schema/membership.js";
import { OAuthToken } from "../models/index.js";

@injectable()
export class OAuthTokenRepo extends GlobalDrizzleRepo<typeof oAuthTokens> {
  protected readonly table = oAuthTokens;
  protected readonly moduleName = "membership";

  public async save(token: OAuthToken) {
    if (token.id) {
      return this.update(token);
    } else {
      return this.create(token);
    }
  }

  protected async create(token: OAuthToken): Promise<OAuthToken> {
    token.id = UniqueIdHelper.shortId();
    const data: any = { ...token, createdAt: new Date() };
    await this.db.insert(oAuthTokens).values(data);
    return token;
  }

  protected async update(token: OAuthToken): Promise<OAuthToken> {
    const data: any = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      clientId: token.clientId,
      userChurchId: token.userChurchId,
      scopes: token.scopes,
      expiresAt: token.expiresAt
    };
    await this.db.update(oAuthTokens).set(data).where(eq(oAuthTokens.id, token.id!));
    return token;
  }

  public load(id: string): Promise<OAuthToken> {
    return this.db.select().from(oAuthTokens).where(eq(oAuthTokens.id, id)).then(r => (r[0] as OAuthToken) ?? null);
  }

  public loadByAccessToken(accessToken: string): Promise<OAuthToken> {
    return this.db.select().from(oAuthTokens).where(eq(oAuthTokens.accessToken, accessToken)).then(r => (r[0] as OAuthToken) ?? null);
  }

  public loadByRefreshToken(refreshToken: string): Promise<OAuthToken> {
    return this.db.select().from(oAuthTokens).where(eq(oAuthTokens.refreshToken, refreshToken)).then(r => (r[0] as OAuthToken) ?? null);
  }

  public loadByClientAndUser(clientId: string, userChurchId: string): Promise<OAuthToken> {
    return this.db.select().from(oAuthTokens)
      .where(and(eq(oAuthTokens.clientId, clientId), eq(oAuthTokens.userChurchId, userChurchId)))
      .then(r => (r[0] as OAuthToken) ?? null);
  }

  public deleteByAccessToken(accessToken: string) {
    return this.db.delete(oAuthTokens).where(eq(oAuthTokens.accessToken, accessToken));
  }

  public deleteByRefreshToken(refreshToken: string) {
    return this.db.delete(oAuthTokens).where(eq(oAuthTokens.refreshToken, refreshToken));
  }

  public deleteExpired() {
    return this.db.delete(oAuthTokens).where(lt(oAuthTokens.expiresAt, new Date()));
  }
}
