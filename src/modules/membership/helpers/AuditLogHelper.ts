import express from "express";
import { AuditLog } from "../models/index.js";
import { Repos } from "../repositories/Repos.js";

export class AuditLogHelper {

  public static getClientIp(req: express.Request): string {
    return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || req.socket?.remoteAddress || "";
  }

  public static async log(
    repos: Repos,
    churchId: string,
    userId: string,
    category: string,
    action: string,
    entityType?: string,
    entityId?: string,
    details?: object,
    ipAddress?: string,
    module?: string,
    batchId?: string
  ): Promise<void> {
    try {
      const log: AuditLog = {
        churchId,
        userId,
        category,
        action,
        entityType,
        entityId,
        details: details ? JSON.stringify(details) : undefined,
        ipAddress,
        module,
        batchId
      };
      await repos.auditLog.create(log);
    } catch (e) {
      console.error("AuditLogHelper.log failed:", e);
    }
  }

  // Field names whose values are never stored in audit details (payment/credential secrets).
  private static SENSITIVE_KEYS = new Set([
    "password",
    "token",
    "account_number",
    "accountnumber",
    "routing_number",
    "routingnumber",
    "cvv",
    "cvc",
    "cardnumber",
    "card_number",
    "nonce",
    "secret",
    "privatekey",
    "accesstoken",
    "refreshtoken",
    "clientsecret"
  ]);

  private static sanitizeValue(value: any, depth: number): any {
    if (depth > 8) return null;
    if (typeof value === "string") {
      if (value.startsWith("data:") || value.length > 4096) return "[stripped]";
      return value;
    }
    if (Array.isArray(value)) return value.map((v) => AuditLogHelper.sanitizeValue(v, depth + 1));
    if (value && typeof value === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        if (AuditLogHelper.SENSITIVE_KEYS.has(k.toLowerCase())) out[k] = "[redacted]";
        else out[k] = AuditLogHelper.sanitizeValue(v, depth + 1);
      }
      return out;
    }
    return value;
  }

  // Strips huge/secret fields and caps serialized size at ~64 KB (oversized -> truncated marker).
  public static capDetails(details?: object): object | undefined {
    if (details === undefined || details === null) return undefined;
    const stripped = AuditLogHelper.sanitizeValue(details, 0);
    let json: string | undefined;
    try { json = JSON.stringify(stripped); } catch { return { truncated: true }; }
    if (json === undefined) return undefined;
    if (json.length > 64000) return { truncated: true };
    return stripped;
  }

  public static async logLogin(repos: Repos, churchId: string, userId: string, success: boolean, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "login", success ? "login_success" : "login_failed", "user", userId, details, ipAddress);
  }

  public static async logPermissionChange(repos: Repos, churchId: string, userId: string, action: string, entityType: string, entityId: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "permission", action, entityType, entityId, details, ipAddress);
  }

  public static async logDonationChange(repos: Repos, churchId: string, userId: string, action: string, entityId: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "donation", action, "donation", entityId, details, ipAddress);
  }

  public static async logPersonChange(repos: Repos, churchId: string, userId: string, action: string, entityId: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "person", action, "person", entityId, details, ipAddress);
  }

  public static async logGroupChange(repos: Repos, churchId: string, userId: string, action: string, entityId: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "group", action, "group", entityId, details, ipAddress);
  }

  public static async logFormChange(repos: Repos, churchId: string, userId: string, action: string, entityId: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "form", action, "form", entityId, details, ipAddress);
  }

  public static async logSettingChange(repos: Repos, churchId: string, userId: string, action: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "settings", action, "setting", undefined, details, ipAddress);
  }

  public static diffFields(oldObj: any, newObj: any, fields: string[]): object | null {
    const changes: Record<string, { old: any; new: any }> = {};
    let hasChanges = false;
    for (const field of fields) {
      const oldVal = oldObj?.[field];
      const newVal = newObj?.[field];
      if (oldVal !== newVal && newVal !== undefined) {
        changes[field] = { old: oldVal ?? null, new: newVal };
        hasChanges = true;
      }
    }
    return hasChanges ? changes : null;
  }
}
