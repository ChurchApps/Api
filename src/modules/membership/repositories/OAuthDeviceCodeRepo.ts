import { injectable } from "inversify";
import { eq, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { oAuthDeviceCodes } from "../../../db/schema/membership.js";
import { OAuthDeviceCode } from "../models/index.js";
import crypto from "crypto";

@injectable()
export class OAuthDeviceCodeRepo extends GlobalDrizzleRepo<typeof oAuthDeviceCodes> {
  protected readonly table = oAuthDeviceCodes;
  protected readonly moduleName = "membership";

  public async save(deviceCode: OAuthDeviceCode) {
    if (deviceCode.id) {
      return this.update(deviceCode);
    } else {
      return this.create(deviceCode);
    }
  }

  protected async create(deviceCode: OAuthDeviceCode): Promise<OAuthDeviceCode> {
    deviceCode.id = UniqueIdHelper.shortId();
    const data: any = {
      id: deviceCode.id,
      deviceCode: deviceCode.deviceCode,
      userCode: deviceCode.userCode,
      clientId: deviceCode.clientId,
      scopes: deviceCode.scopes,
      expiresAt: deviceCode.expiresAt,
      pollInterval: deviceCode.pollInterval || 5,
      status: deviceCode.status || "pending",
      createdAt: new Date()
    };
    await this.db.insert(oAuthDeviceCodes).values(data);
    return deviceCode;
  }

  protected async update(deviceCode: OAuthDeviceCode): Promise<OAuthDeviceCode> {
    const data: any = {
      status: deviceCode.status,
      approvedByUserId: deviceCode.approvedByUserId,
      userChurchId: deviceCode.userChurchId,
      churchId: deviceCode.churchId,
      expiresAt: deviceCode.expiresAt
    };
    await this.db.update(oAuthDeviceCodes).set(data).where(eq(oAuthDeviceCodes.id, deviceCode.id!));
    return deviceCode;
  }

  public load(id: string): Promise<OAuthDeviceCode> {
    return this.db.select().from(oAuthDeviceCodes).where(eq(oAuthDeviceCodes.id, id)).then(r => (r[0] as OAuthDeviceCode) ?? null);
  }

  public loadByDeviceCode(deviceCode: string): Promise<OAuthDeviceCode> {
    return this.db.select().from(oAuthDeviceCodes).where(eq(oAuthDeviceCodes.deviceCode, deviceCode)).then(r => (r[0] as OAuthDeviceCode) ?? null);
  }

  public async loadByUserCode(userCode: string): Promise<OAuthDeviceCode> {
    const normalizedCode = userCode.replace(/-/g, "").toUpperCase();
    const rows = await this.executeRows(
      sql`SELECT * FROM oAuthDeviceCodes WHERE REPLACE(userCode, '-', '')=${normalizedCode} AND status='pending'`
    );
    return (rows[0] as OAuthDeviceCode) ?? null;
  }

  public deleteExpired() {
    return this.db.execute(sql`DELETE FROM oAuthDeviceCodes WHERE expiresAt < NOW() AND status IN ('pending', 'expired')`);
  }

  public static generateDeviceCode(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  public static generateUserCode(): string {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[crypto.randomInt(chars.length)];
    }
    return code;
  }
}
