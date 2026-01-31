import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { OAuthDeviceCode } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";
import { BaseRepo } from "../../../shared/infrastructure/BaseRepo.js";
import { injectable } from "inversify";
import crypto from "crypto";

@injectable()
export class OAuthDeviceCodeRepo extends BaseRepo<OAuthDeviceCode> {
  protected tableName = "oAuthDeviceCodes";
  protected hasSoftDelete = false;

  protected async create(deviceCode: OAuthDeviceCode): Promise<OAuthDeviceCode> {
    deviceCode.id = this.createId();
    const expiresAt = DateHelper.toMysqlDate(deviceCode.expiresAt);
    const sql = `INSERT INTO oAuthDeviceCodes (id, deviceCode, userCode, clientId, scopes, expiresAt, pollInterval, status, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW());`;
    const params = [
      deviceCode.id,
      deviceCode.deviceCode,
      deviceCode.userCode,
      deviceCode.clientId,
      deviceCode.scopes,
      expiresAt,
      deviceCode.pollInterval || 5,
      deviceCode.status || "pending"
    ];
    await TypedDB.query(sql, params);
    return deviceCode;
  }

  protected async update(deviceCode: OAuthDeviceCode): Promise<OAuthDeviceCode> {
    const expiresAt = DateHelper.toMysqlDate(deviceCode.expiresAt);
    const sql = "UPDATE oAuthDeviceCodes SET status=?, approvedByUserId=?, userChurchId=?, churchId=?, expiresAt=? WHERE id=?;";
    const params = [deviceCode.status, deviceCode.approvedByUserId, deviceCode.userChurchId, deviceCode.churchId, expiresAt, deviceCode.id];
    await TypedDB.query(sql, params);
    return deviceCode;
  }

  public load(id: string): Promise<OAuthDeviceCode> {
    return TypedDB.queryOne("SELECT * FROM oAuthDeviceCodes WHERE id=?", [id]);
  }

  public loadByDeviceCode(deviceCode: string): Promise<OAuthDeviceCode> {
    return TypedDB.queryOne("SELECT * FROM oAuthDeviceCodes WHERE deviceCode=?", [deviceCode]);
  }

  public loadByUserCode(userCode: string): Promise<OAuthDeviceCode> {
    // Normalize: remove hyphens and uppercase
    const normalizedCode = userCode.replace(/-/g, "").toUpperCase();
    return TypedDB.queryOne(
      //"SELECT * FROM oAuthDeviceCodes WHERE REPLACE(userCode, '-', '')=? AND status='pending' AND expiresAt > NOW()",
      "SELECT * FROM oAuthDeviceCodes WHERE REPLACE(userCode, '-', '')=? AND status='pending'",
      [normalizedCode]
    );
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM oAuthDeviceCodes WHERE id=?", [id]);
  }

  public deleteExpired() {
    return TypedDB.query("DELETE FROM oAuthDeviceCodes WHERE expiresAt < NOW() AND status IN ('pending', 'expired')", []);
  }

  // Generate cryptographically secure device code (32 bytes, hex encoded)
  public static generateDeviceCode(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  // Generate user-friendly code (6 chars, no ambiguous characters)
  public static generateUserCode(): string {
    // Characters that are easy to read on TV (excluding ambiguous: 0,O,1,I,L)
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[crypto.randomInt(chars.length)];
    }
    return code;
  }
}
