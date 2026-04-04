import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { OAuthDeviceCode } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";
import crypto from "crypto";

@injectable()
export class OAuthDeviceCodeRepo {
  public async save(model: OAuthDeviceCode) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(deviceCode: OAuthDeviceCode): Promise<OAuthDeviceCode> {
    deviceCode.id = UniqueIdHelper.shortId();
    const expiresAt = DateHelper.toMysqlDate(deviceCode.expiresAt);
    await getDb().insertInto("oAuthDeviceCodes").values({
      id: deviceCode.id,
      deviceCode: deviceCode.deviceCode,
      userCode: deviceCode.userCode,
      clientId: deviceCode.clientId,
      scopes: deviceCode.scopes,
      expiresAt: expiresAt as any,
      pollInterval: deviceCode.pollInterval || 5,
      status: deviceCode.status || "pending",
      createdAt: sql`NOW()` as any
    }).execute();
    return deviceCode;
  }

  private async update(deviceCode: OAuthDeviceCode): Promise<OAuthDeviceCode> {
    const expiresAt = DateHelper.toMysqlDate(deviceCode.expiresAt);
    await getDb().updateTable("oAuthDeviceCodes").set({
      status: deviceCode.status,
      approvedByUserId: deviceCode.approvedByUserId,
      userChurchId: deviceCode.userChurchId,
      churchId: deviceCode.churchId,
      expiresAt: expiresAt as any
    }).where("id", "=", deviceCode.id).execute();
    return deviceCode;
  }

  public async load(id: string): Promise<OAuthDeviceCode> {
    return (await getDb().selectFrom("oAuthDeviceCodes").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadByDeviceCode(deviceCode: string): Promise<OAuthDeviceCode> {
    return (await getDb().selectFrom("oAuthDeviceCodes").selectAll().where("deviceCode", "=", deviceCode).executeTakeFirst()) ?? null;
  }

  public async loadByUserCode(userCode: string): Promise<OAuthDeviceCode> {
    // Normalize: remove hyphens and uppercase
    const normalizedCode = userCode.replace(/-/g, "").toUpperCase();
    const result = await sql`SELECT * FROM oAuthDeviceCodes WHERE REPLACE(userCode, '-', '')=${normalizedCode} AND status='pending'`.execute(getDb());
    return (result.rows as any[])?.[0] || null;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("oAuthDeviceCodes").where("id", "=", id).execute();
  }

  public async deleteExpired() {
    await sql`DELETE FROM oAuthDeviceCodes WHERE expiresAt < NOW() AND status IN ('pending', 'expired')`.execute(getDb());
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

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
