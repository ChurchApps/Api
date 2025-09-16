import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { OAuthToken } from "../models";
import { DateHelper } from "../helpers";
import { BaseRepository } from "../../../shared/infrastructure/BaseRepository";
import { injectable } from "inversify";

@injectable()
export class OAuthTokenRepository extends BaseRepository<OAuthToken> {
  protected tableName = "oAuthTokens";
  protected hasSoftDelete = false;
  protected async create(token: OAuthToken): Promise<OAuthToken> {
    token.id = this.createId();
    const expiresAt = DateHelper.toMysqlDate(token.expiresAt);
    const sql = "INSERT INTO oAuthTokens (id, accessToken, refreshToken, clientId, userChurchId, scopes, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW());";
    const params = [token.id, token.accessToken, token.refreshToken, token.clientId, token.userChurchId, token.scopes, expiresAt];
    await TypedDB.query(sql, params);
    return token;
  }

  protected async update(token: OAuthToken): Promise<OAuthToken> {
    const expiresAt = DateHelper.toMysqlDate(token.expiresAt);
    const sql = "UPDATE oAuthTokens SET accessToken=?, refreshToken=?, clientId=?, userChurchId=?, scopes=?, expiresAt=? WHERE id=?;";
    const params = [token.accessToken, token.refreshToken, token.clientId, token.userChurchId, token.scopes, expiresAt, token.id];
    await TypedDB.query(sql, params);
    return token;
  }

  public load(id: string): Promise<OAuthToken> {
    return TypedDB.queryOne("SELECT * FROM oAuthTokens WHERE id=?", [id]);
  }

  public loadByAccessToken(accessToken: string): Promise<OAuthToken> {
    return TypedDB.queryOne("SELECT * FROM oAuthTokens WHERE accessToken=?", [accessToken]);
  }

  public loadByRefreshToken(refreshToken: string): Promise<OAuthToken> {
    return TypedDB.queryOne("SELECT * FROM oAuthTokens WHERE refreshToken=?", [refreshToken]);
  }

  public loadByClientAndUser(clientId: string, userChurchId: string): Promise<OAuthToken> {
    return TypedDB.queryOne("SELECT * FROM oAuthTokens WHERE clientId=? AND userChurchId=?", [clientId, userChurchId]);
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM oAuthTokens WHERE id=?", [id]);
  }

  public deleteByAccessToken(accessToken: string) {
    return TypedDB.query("DELETE FROM oAuthTokens WHERE accessToken=?", [accessToken]);
  }

  public deleteByRefreshToken(refreshToken: string) {
    return TypedDB.query("DELETE FROM oAuthTokens WHERE refreshToken=?", [refreshToken]);
  }

  public deleteExpired() {
    return TypedDB.query("DELETE FROM oAuthTokens WHERE expiresAt < NOW()", []);
  }
}
