import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { OAuthCode } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";
import { BaseRepo } from "../../../shared/infrastructure/BaseRepo.js";
import { injectable } from "inversify";

@injectable()
export class OAuthCodeRepo extends BaseRepo<OAuthCode> {
  protected tableName = "oAuthCodes";
  protected hasSoftDelete = false;
  protected async create(authCode: OAuthCode): Promise<OAuthCode> {
    authCode.id = this.createId();
    const expiresAt = DateHelper.toMysqlDate(authCode.expiresAt);
    const sql = "INSERT INTO oAuthCodes (id, code, clientId, userChurchId, redirectUri, scopes, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW());";
    const params = [authCode.id, authCode.code, authCode.clientId, authCode.userChurchId, authCode.redirectUri, authCode.scopes, expiresAt];
    await TypedDB.query(sql, params);
    return authCode;
  }

  protected async update(authCode: OAuthCode): Promise<OAuthCode> {
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
