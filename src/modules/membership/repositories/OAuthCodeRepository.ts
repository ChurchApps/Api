import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { OAuthCode } from "../models";
import { UniqueIdHelper, DateHelper } from "../helpers";

export class OAuthCodeRepository {
  public save(authCode: OAuthCode) {
    return authCode.id ? this.update(authCode) : this.create(authCode);
  }

  private async create(authCode: OAuthCode) {
    authCode.id = UniqueIdHelper.shortId();
    const expiresAt = DateHelper.toMysqlDate(authCode.expiresAt);
    const sql = "INSERT INTO oAuthCodes (id, code, clientId, userChurchId, redirectUri, scopes, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW());";
    const params = [authCode.id, authCode.code, authCode.clientId, authCode.userChurchId, authCode.redirectUri, authCode.scopes, expiresAt];
    await TypedDB.query(sql, params);
    return authCode;
  }

  private async update(authCode: OAuthCode) {
    const expiresAt = DateHelper.toMysqlDate(authCode.expiresAt);
    const sql = "UPDATE oAuthCodes SET code=?, clientId=?, userChurchId=?, redirectUri=?, scopes=?, expiresAt=? WHERE id=?;";
    const params = [authCode.code, authCode.clientId, authCode.userChurchId, authCode.redirectUri, authCode.scopes, expiresAt, authCode.id];
    await TypedDB.query(sql, params);
    return authCode;
  }

  public load(id: string): Promise<OAuthCode> {
    return TypedDB.queryOne("SELECT * FROM oAuthCodes WHERE id=?", [id]);
  }

  public loadByCode(code: string): Promise<OAuthCode> {
    return TypedDB.queryOne("SELECT * FROM oAuthCodes WHERE code=?", [code]);
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM oAuthCodes WHERE id=?", [id]);
  }

  public deleteByCode(code: string) {
    return TypedDB.query("DELETE FROM oAuthCodes WHERE code=?", [code]);
  }

  public deleteExpired() {
    return TypedDB.query("DELETE FROM oAuthCodes WHERE expiresAt < NOW()", []);
  }
}
