import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { OAuthToken } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";

@injectable()
export class OAuthTokenRepo {
  public async save(model: OAuthToken) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(token: OAuthToken): Promise<OAuthToken> {
    token.id = UniqueIdHelper.shortId();
    const expiresAt = DateHelper.toMysqlDate(token.expiresAt);
    await getDb().insertInto("oAuthTokens").values({
      id: token.id,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      clientId: token.clientId,
      userChurchId: token.userChurchId,
      scopes: token.scopes,
      expiresAt: expiresAt as any,
      createdAt: sql`NOW()` as any
    }).execute();
    return token;
  }

  private async update(token: OAuthToken): Promise<OAuthToken> {
    const expiresAt = DateHelper.toMysqlDate(token.expiresAt);
    await getDb().updateTable("oAuthTokens").set({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      clientId: token.clientId,
      userChurchId: token.userChurchId,
      scopes: token.scopes,
      expiresAt: expiresAt as any
    }).where("id", "=", token.id).execute();
    return token;
  }

  public async load(id: string): Promise<OAuthToken> {
    return (await getDb().selectFrom("oAuthTokens").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadByAccessToken(accessToken: string): Promise<OAuthToken> {
    return (await getDb().selectFrom("oAuthTokens").selectAll().where("accessToken", "=", accessToken).executeTakeFirst()) ?? null;
  }

  public async loadByRefreshToken(refreshToken: string): Promise<OAuthToken> {
    return (await getDb().selectFrom("oAuthTokens").selectAll().where("refreshToken", "=", refreshToken).executeTakeFirst()) ?? null;
  }

  public async loadByClientAndUser(clientId: string, userChurchId: string): Promise<OAuthToken> {
    return (await getDb().selectFrom("oAuthTokens").selectAll()
      .where("clientId", "=", clientId)
      .where("userChurchId", "=", userChurchId)
      .executeTakeFirst()) ?? null;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("oAuthTokens").where("id", "=", id).execute();
  }

  public async deleteByAccessToken(accessToken: string) {
    await getDb().deleteFrom("oAuthTokens").where("accessToken", "=", accessToken).execute();
  }

  public async deleteByRefreshToken(refreshToken: string) {
    await getDb().deleteFrom("oAuthTokens").where("refreshToken", "=", refreshToken).execute();
  }

  public async deleteExpired() {
    await sql`DELETE FROM oAuthTokens WHERE expiresAt < NOW()`.execute(getDb());
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
